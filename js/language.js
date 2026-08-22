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
function assignLineString(exprStr){ return `int result = ${exprStr};`; }

