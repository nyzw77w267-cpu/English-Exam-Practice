/* Pure data logic. Works as an ordinary local script and in Node tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ExamCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = 3;
  function fresh() { return {version: VERSION, theme: 'system', attempts: [], favorites: [], exams: [], session: null, activeExam: null, issueNotes: {}, wrongBook: {}}; }
  const normalize = value => String(value ?? '').trim().toLocaleLowerCase('en-US');
  function grade(q, value) { return q.type === 'blank' ? q.answer.some(a => normalize(a) === normalize(value)) : q.answer === value; }
  function localDay(date = new Date()) { return [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-'); }
  function shuffle(values, rng = Math.random) {
    const out = values.slice();
    for (let i=out.length-1;i>0;i--) { const j=Math.floor(rng()*(i+1)); [out[i],out[j]]=[out[j],out[i]]; }
    return out;
  }
  function sample(questions, count, rng = Math.random) {
    const groups = [...new Set(questions.map(q=>q.category))].map(c=>shuffle(questions.filter(q=>q.category===c),rng));
    const result=[];
    while(result.length < Math.min(count,questions.length)) for (const g of groups) { if(g.length && result.length<count) result.push(g.pop()); }
    return shuffle(result,rng).map(q=>q.id);
  }
  function uid() { return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10); }
  function record(state, q, value, mode='practice', examId=null, time=new Date()) {
    const attempt={id:uid(),questionId:q.id,value,autoCorrect:grade(q,value),status:grade(q,value)?'correct':'wrong',
      at:time.toISOString(),day:localDay(time),mode,examId,reviewNote:''};
    state.attempts.push(attempt);
    if(!attempt.autoCorrect) addToWrongBook(state,q.id,time);
    return attempt;
  }
  function latest(state) { const map=new Map(); for(const a of state.attempts) map.set(a.questionId,a); return map; }
  function stats(state, questions, today=localDay()) {
    const ids=new Set(questions.map(q=>q.id)); const attempts=state.attempts.filter(a=>ids.has(a.questionId));
    const final=attempts.filter(a=>a.status!=='pending');const last=latest({...state,attempts});
    return {total:questions.length,completed:last.size,attempts:attempts.length,correct:final.filter(a=>a.status==='correct').length,
      accuracy:final.length?Math.round(final.filter(a=>a.status==='correct').length/final.length*100):0,
      today:attempts.filter(a=>a.day===today).length,wrong:wrongEntries(state,questions).filter(e=>!e.mastered).length,
      pending:attempts.filter(a=>a.status==='pending').length};
  }
  function finishExam(state, questions, now=new Date()) {
    const exam=state.activeExam;if(!exam)return null;
    const lookup=new Map(questions.map(q=>[q.id,q]));
    const attemptIds=exam.ids.map(id=>record(state,lookup.get(id),exam.answers[id]||'','exam',exam.id,now).id);
    const result={id:exam.id,ids:exam.ids,attemptIds,startedAt:exam.startedAt,submittedAt:now.toISOString(),
      durationMinutes:exam.durationMinutes};state.exams.push(result);state.activeExam=null;return result;
  }
  function review(state, attemptId, status, note) {
    const a=state.attempts.find(x=>x.id===attemptId);if(!a)return;
    a.status=status; a.reviewNote=String(note||'').slice(0,1000);a.reviewedAt=new Date().toISOString();
  }
  function validateState(raw, questions) {
    if(!raw || typeof raw!=='object' || ![1,2,VERSION].includes(raw.version)) throw Error('备份版本不兼容，请先升级应用。');
    if(!Array.isArray(raw.attempts)||!Array.isArray(raw.favorites)||!Array.isArray(raw.exams))throw Error('备份结构不完整。');
    const map=new Map(questions.map(q=>[q.id,q])); const ids=new Set(map.keys());
    if(raw.attempts.length>100000||raw.exams.length>10000)throw Error('备份记录过多。');
    const aIds=new Set();
    for(const a of raw.attempts) {
      if(!a || !ids.has(a.questionId)|| typeof a.id!=='string'||!a.id||aIds.has(a.id)||typeof a.value!=='string'||a.value.length>5000||
        !['correct','wrong','pending'].includes(a.status)||!Number.isFinite(Date.parse(a.at))||!/^\d{4}-\d{2}-\d{2}$/.test(a.day)||
        !['practice','exam'].includes(a.mode)||typeof a.autoCorrect!=='boolean'||(a.status==='pending'&&map.get(a.questionId).type!=='blank')) throw Error('备份答题记录无效。');
      aIds.add(a.id);
    }
    if(raw.favorites.some(id=>!ids.has(id)))throw Error('收藏题目与当前题库不匹配。');
    function validIds(list) { return Array.isArray(list)&&list.length>0&&new Set(list).size===list.length&&list.every(id=>ids.has(id)); }
    const state=fresh();state.attempts=raw.attempts;state.favorites=[...new Set(raw.favorites)];state.exams=raw.exams;
    state.theme=['light','dark','system'].includes(raw.theme)?raw.theme:'system';
    if(raw.session) {
      const s=raw.session;
      if(!validIds(s.ids)||!Number.isInteger(s.index)||s.index<0||s.index>s.ids.length||typeof s.title!=='string'||
        (s.attemptId&&!aIds.has(s.attemptId))||typeof s.draft!=='string')throw Error('练习进度无效。');
      if(s.attemptId&&s.index<s.ids.length&&!state.attempts.some(a=>a.id===s.attemptId&&a.questionId===s.ids[s.index]))throw Error('练习记录不对应。');
      state.session=s;
    }
    if(raw.activeExam) {
      const e=raw.activeExam;
      if(!validIds(e.ids)||typeof e.id!=='string'||!Number.isInteger(e.index)||e.index<0||e.index>=e.ids.length||
         !Number.isFinite(e.deadline)||!Number.isFinite(Date.parse(e.startedAt))||!Number.isFinite(e.durationMinutes)||e.durationMinutes<=0||!e.answers||typeof e.answers!=='object'||Array.isArray(e.answers)||
         Object.entries(e.answers).some(([id,value])=>!e.ids.includes(id)||typeof value!=='string'||value.length>5000||
          (map.get(id).type==='choice'&&value!==''&&!map.get(id).options.includes(value))))throw Error('考试进度无效。');
      state.activeExam=e;
    }
    const eIds=new Set();
    for(const e of state.exams) {
      if(!e||typeof e.id!=='string'||eIds.has(e.id)||!validIds(e.ids)||!Array.isArray(e.attemptIds)||e.attemptIds.length!==e.ids.length||new Set(e.attemptIds).size!==e.attemptIds.length||
        !Number.isFinite(Date.parse(e.startedAt))||!Number.isFinite(Date.parse(e.submittedAt))||e.attemptIds.some((id,i)=>!state.attempts.some(a=>a.id===id&&a.questionId===e.ids[i]&&a.examId===e.id)))throw Error('考试结果无效。');
      eIds.add(e.id);
    }
    if(state.activeExam&&eIds.has(state.activeExam.id))throw Error('考试已提交，无法重复恢复。');
    if(raw.issueNotes&&typeof raw.issueNotes==='object'&&!Array.isArray(raw.issueNotes))
      for(const [k,v] of Object.entries(raw.issueNotes))if(/^R\d\d$/.test(k)&&typeof v==='string')state.issueNotes[k]=v.slice(0,2000);
    if(raw.wrongBook!==undefined) {
      if(!raw.wrongBook||typeof raw.wrongBook!=='object'||Array.isArray(raw.wrongBook))throw Error('错题掌握状态无效。');
      for(const [id,entry] of Object.entries(raw.wrongBook)) {
        if(!ids.has(id)||!entry||typeof entry.mastered!=='boolean'||!Number.isFinite(Date.parse(entry.addedAt))||
          !Number.isFinite(Date.parse(entry.updatedAt))||(entry.masteredAt!==null&&!Number.isFinite(Date.parse(entry.masteredAt))))throw Error('错题掌握记录无效。');
        state.wrongBook[id]={mastered:entry.mastered,addedAt:entry.addedAt,updatedAt:entry.updatedAt,masteredAt:entry.masteredAt};
      }
    }
    // Old versions retained all attempts, so even previously auto-removed mistakes can be restored.
    for(const a of state.attempts) if(!a.autoCorrect||a.status!=='correct')addToWrongBook(state,a.questionId,new Date(a.at));
    return state;
  }
  function addToWrongBook(state,id,time=new Date()) {
    if(!state.wrongBook)state.wrongBook={};
    if(!state.wrongBook[id])state.wrongBook[id]={mastered:false,addedAt:time.toISOString(),updatedAt:time.toISOString(),masteredAt:null};
  }
  function setMastered(state,id,mastered,time=new Date()) {
    if(!state.wrongBook?.[id])return false;
    const entry=state.wrongBook[id];entry.mastered=mastered;entry.updatedAt=time.toISOString();
    if(mastered)entry.masteredAt=time.toISOString();return true;
  }
  function wrongEntries(state,questions) {
    const ids=new Set(questions.map(q=>q.id)),entries=new Map();
    for(const [id,entry] of Object.entries(state.wrongBook||{}))if(ids.has(id))entries.set(id,{questionId:id,...entry,wrongCount:0,initialWrongCount:0,pendingCount:0,reviewCorrectedCount:0,latest:null});
    for(const a of state.attempts) {
      if(!ids.has(a.questionId))continue;
      if((!a.autoCorrect||a.status!=='correct')&&!entries.has(a.questionId))entries.set(a.questionId,{questionId:a.questionId,mastered:false,addedAt:a.at,updatedAt:a.at,masteredAt:null,wrongCount:0,initialWrongCount:0,pendingCount:0,reviewCorrectedCount:0,latest:null});
    }
    for(const a of state.attempts) {
      const entry=entries.get(a.questionId);if(!entry)continue;
      entry.latest=a;
      if(!a.autoCorrect)entry.initialWrongCount++;
      if(a.status==='wrong')entry.wrongCount++;
      if(a.status==='pending')entry.pendingCount++;
      if(!a.autoCorrect&&a.status==='correct')entry.reviewCorrectedCount++;
    }
    return [...entries.values()];
  }
  function examSummary(state,exam) {
    const attempts=exam.attemptIds.map(id=>state.attempts.find(a=>a.id===id));
    const correct=attempts.filter(a=>a.status==='correct').length,wrong=attempts.filter(a=>a.status==='wrong').length,pending=attempts.length-correct-wrong;
    return {attempts,total:attempts.length,correct,wrong,pending,score:Math.round(correct/attempts.length*100),accuracy:Math.round(correct/attempts.length*100)};
  }
  function newIds(bank) { return (bank.releases?.[bank.releases.length-1]?.addedIds || []).filter(id=>bank.questions.some(q=>q.id===id)); }
  function frequentWrong(state, questions) {
    const counts=new Map();
    for(const a of state.attempts) if(a.status==='wrong') counts.set(a.questionId,(counts.get(a.questionId)||0)+1);
    return questions.filter(q=>(counts.get(q.id)||0)>=2).sort((a,b)=>counts.get(b.id)-counts.get(a.id)).map(q=>({id:q.id,count:counts.get(q.id)}));
  }
  function knowledgeStats(state, questions) {
    const points=[...new Set(questions.flatMap(q=>q.knowledgePoints||[q.topic]))];
    return points.map(point=>{
      const qs=questions.filter(q=>(q.knowledgePoints||[q.topic]).includes(point));const ids=new Set(qs.map(q=>q.id));
      const attempts=state.attempts.filter(a=>ids.has(a.questionId)&&a.status!=='pending');const recent=attempts.slice(-10);
      const rate=aa=>aa.length?Math.round(aa.filter(a=>a.status==='correct').length/aa.length*100):null;
      const recentRate=rate(recent);
      return {point,ids:[...ids],count:attempts.length,accuracy:rate(attempts),recentCount:recent.length,recentAccuracy:recentRate,weak:recent.length>=3&&recentRate<70};
    }).sort((a,b)=>Number(b.weak)-Number(a.weak)||a.point.localeCompare(b.point,'zh-CN'));
  }
  function readBackup(raw, bank) {
    if(raw.app!=='English Exam Practice'||raw.sourceSha256!==bank.sourceSha256) throw Error('备份不属于当前讲义，未更改已有记录。');
    // Bank version differences are safe when all referenced stable IDs remain available.
    return validateState(raw.state,bank.questions);
  }
  return {VERSION,fresh,normalize,grade,localDay,shuffle,sample,uid,record,latest,stats,finishExam,review,validateState,newIds,frequentWrong,knowledgeStats,readBackup,addToWrongBook,setMastered,wrongEntries,examSummary};
});
