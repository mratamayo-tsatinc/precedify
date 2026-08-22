function renderSetup(container){
  const card = h('div',{class:'card'});

  // Language picker intentionally omitted here: at this stage Java and C
  // produce identical declaration/assignment text for every profile (see
  // declLine()), so exposing the choice would just be a no-op control that
  // teaches nothing. state.language stays 'java' as the fixed default;
  // re-add this field if/when a profile actually diverges between the two
  // (e.g. C's lack of a native boolean type becoming visible to the student).

  card.appendChild(h('div',{class:'field'},
    h('span',{class:'field-label'},'Mode'),
    h('div',{class:'pillrow'},
      [['practice','Practice'],['exam','Exam']].map(([id,label])=>h('button',{class:'pill'+(state.mode===id?' active':''), onclick:()=>{state.mode=id; render();}}, label))
    ),
    h('p',{class:'helper-text'}, state.mode==='exam'
      ? 'One check per item. Undo is allowed before you check; reset, retry, and the correct-solution view are not available.'
      : 'One check per item, same as Exam — step correctness is never shown until you check. After checking, you can reset and retry the item, or view the correct solution.')
  ));

  card.appendChild(h('div',{class:'field'},
    h('span',{class:'field-label'},'Exercise profile'),
    h('div',{class:'profile-grid'},
      PROFILES.map(p=>h('button',{class:'profile-card'+(state.profileId===p.id?' active':''), onclick:()=>{state.profileId=p.id; render();}},
        h('div',{class:'pname'}, p.name),
        h('div',{class:'pdesc'}, p.description)
      ))
    )
  ));

  card.appendChild(h('div',{class:'field'},
    h('span',{class:'field-label'},'Number of items'),
    h('div',{class:'numrow'},
      h('input',{type:'number', min:'1', max:'50', value:String(state.itemCount),
        oninput:(e)=>{ state.itemCount = Math.max(1, Math.min(50, parseInt(e.target.value)||1)); }
      }),
      h('span',{style:'color:var(--text-mute);font-size:12.5px;'}, 'structurally equivalent, randomized exercises')
    )
  ));

  card.appendChild(h('button',{class:'start-btn', onclick:startSession}, `Start ${state.mode==='exam'?'Exam':'Practice'} →`));

  container.appendChild(card);
}

