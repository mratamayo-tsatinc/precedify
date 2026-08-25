function renderSetup(container){
  const card = h('div',{class:'card'});

  // Display current selected profile information
  const profile = currentProfile();
  card.appendChild(h('div',{class:'field'},
    h('span',{class:'field-label'},'Current Exercise Profile'),
    h('div',{class:'profile-info'},
      h('div',{class:'profile-info-name'}, profile.name),
      h('div',{class:'profile-info-desc'}, profile.description)
    )
  ));

  // Language picker intentionally omitted here: at this stage Java and C
  // produce identical declaration/assignment text for every profile (see
  // declLine()), so exposing the choice would just be a no-op control that
  // teaches nothing. state.language stays 'java' as the fixed default;
  // re-add this field if/when a profile actually diverges between the two
  // (e.g. C's lack of a native boolean type becoming visible to the student).

  card.appendChild(h('div',{class:'field'},
    h('span',{class:'field-label'},'Number of items'),
    h('div',{class:'numrow'},
      h('input',{type:'number', min:'1', max:'50', value:String(state.itemCount),
        oninput:(e)=>{ state.itemCount = Math.max(1, Math.min(50, parseInt(e.target.value)||1)); }
      }),
      h('span',{style:'color:var(--text-mute);font-size:12.5px;'}, 'structurally equivalent, randomized exercises')
    )
  ));

  card.appendChild(h('div', {class:'setup-hint'},
    h('i',{class:'fa-solid fa-lightbulb'}),
    h('span', 'Select a profile from the sidebar to begin. Your progress is saved for each profile.')
  ));

  container.appendChild(card);
}

