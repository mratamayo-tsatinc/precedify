// ============================================================================
// LANGUAGE-SPECIFIC SOURCE RENDERING
// ============================================================================
function declLine(decl, language){
  if(decl.kind==='variable'){
    if(decl.isBoolean){
      // C has no native boolean literal in this app's teaching scope, so a
      // boolean-valued variable is declared as int 0/1 there, but still as
      // `boolean` with true/false in Java — the engine's internal value
      // (JS true/false) is unchanged; only the declaration text differs.
      return language==='java' ? `boolean ${decl.name} = ${decl.value};` : `int ${decl.name} = ${decl.value?1:0};`;
    }
    return `int ${decl.name} = ${decl.value};`;
  }
  if(language==='java') return `final int ${decl.name} = ${decl.value};`;
  return `const int ${decl.name} = ${decl.value};`;
}
// resultName is the per-item, randomly (seeded) chosen assignment-target
// name (see generator.js's RESULT_NAMES/pickResultName) — previously this
// always emitted the hardcoded literal "result" for every item. Falls back
// to 'result' if a caller somehow doesn't have one (e.g. old/serialized
// item data missing the field), so this never renders "int undefined = ...;".
function assignLineString(exprStr, resultName){ return `int ${resultName || 'result'} = ${exprStr};`; }