function renderDone(container){
  const total = state.items.length;
  // Session total is the raw sum of each item's earned/possible points from
  // whichever ITEM_SCORE_MODELS policy is configured (SCORING_CONFIG.model) —
  // shown as an honest [Student Score]/[Max Score], not a percentage.
  const totalPoints = state.items.reduce((s,i)=>s+(i.points||0),0);
  const totalMaxPoints = state.items.reduce((s,i)=>s+(i.maxPoints||0),0);
  const correctCount = state.items.filter(i=>i.wasCorrectFinal).length;

  const card = h('div',{class:'card'});
  card.appendChild(h('div',{class:'summary-hero'},
    h('div',{class:'summary-score'}, `${totalPoints}/${totalMaxPoints}`),
    h('div',{class:'summary-sub'}, `${correctCount}/${total} items correct  ·  ${currentProfile().name}  ·  ${state.mode}`)
  ));
  const list = h('div',{class:'summary-list'});
  state.items.forEach((it,i)=>{
    list.appendChild(h('div',{class:'sumrow'},
      h('span',{class:'si'}, `Item ${i+1}  ·  ${it.correctSteps}/${it.totalOpSteps} steps  ·  ${it.points}/${it.maxPoints} pts`),
      h('span',{class:'sr '+(it.wasCorrectFinal?'ok':'no')}, it.wasCorrectFinal ? 'Correct' : 'Incorrect')
    ));
  });
  card.appendChild(list);
  card.appendChild(h('button',{class:'start-btn', onclick:restart, style:'margin-top:26px;'}, 'New session'));
  container.appendChild(card);
  // Additive hook for the juice/feel module (js/juice.js) — entirely
  // optional. card is already attached to the live DOM at this point.
  // Silent no-op if the script isn't loaded or fails for any reason.
  if(typeof renderSessionCelebration === 'function'){
    try{
      const heroEl = card.querySelector('.summary-hero') || card;
      renderSessionCelebration(heroEl);
    }catch(e){ /* silent no-op */ }
  }
}

