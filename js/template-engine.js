// ============================================================================
// TEMPLATE ENGINE — parses a profile's `template` string into an AST and
// interprets it to build a concrete expression tree. Replaces generator.js's
// foldLeft / precedenceParse / buildParenOverride / buildParenOverrideMulti /
// buildParenOverrideDual / buildRelationalBooleanMix with ONE generic
// interpreter, driven entirely by the template string + a profile's
// operators/shape/extras config.
// ============================================================================

// ----------------------------------------------------------------------------
// Tokenizer: '(' and ')' are always their own tokens (even when glued
// directly to a word, e.g. "(operand" or "operand))"); everything else is
// a whitespace-delimited word (an operand spec or a tier keyword).
// ----------------------------------------------------------------------------
function tokenizeTemplate(str){
  const tokens = [];
  let i = 0;
  while(i < str.length){
    const c = str[i];
    if(/\s/.test(c)){ i++; continue; }
    if(c === '(' || c === ')'){ tokens.push(c); i++; continue; }
    let j = i;
    while(j < str.length && !/\s/.test(str[j]) && str[j] !== '(' && str[j] !== ')') j++;
    tokens.push(str.slice(i, j));
    i = j;
  }
  return tokens;
}

const TIER_NAMES = new Set(['op','low','high','cmp','eq','and','or']);

// Parses an 'operand', 'operand:lit', 'operand:var:bool', 'operand:var:unary',
// 'operand:var:bool:unary', 'operand:unary' token into {kind, bool, unary}.
// kind is null for an unpinned (free-pool) slot.
function parseOperandToken(tok){
  const parts = tok.split(':');
  if(parts[0] !== 'operand') throw new Error(`Malformed operand token '${tok}'`);
  const spec = {kind:null, bool:false, unary:false};
  for(let k=1;k<parts.length;k++){
    const tag = parts[k];
    if(tag === 'lit') spec.kind = 'literal';
    else if(tag === 'var') spec.kind = 'variable';
    else if(tag === 'const') spec.kind = 'constant';
    else if(tag === 'bool') spec.bool = true;
    else if(tag === 'unary') spec.unary = true;
    else throw new Error(`Unknown operand tag ':${tag}' in token '${tok}'`);
  }
  if(spec.bool && spec.kind && spec.kind !== 'variable'){
    throw new Error(`':bool' can only combine with ':var' (got '${tok}')`);
  }
  if(spec.unary && spec.kind && spec.kind !== 'variable'){
    throw new Error(`':unary' can only combine with ':var' (got '${tok}')`);
  }
  return spec;
}

// ----------------------------------------------------------------------------
// Recursive-descent parser.
//   chain := term (tier term)*
//   term  := 'operand...' | '(' chain ')'
// A parenthesized group parses to its own chain node, nested as ONE opaque
// term within the surrounding chain — this is what lets an explicit paren
// group override what free precedence-climbing on a flat run would produce
// (see buildChain below).
// ----------------------------------------------------------------------------
function parseTemplateTokens(tokens){
  let pos = 0;
  const peek = () => tokens[pos];
  const advance = () => tokens[pos++];

  function parseTerm(){
    const tok = peek();
    if(tok === '('){
      advance();
      const inner = parseChain();
      if(advance() !== ')') throw new Error("Expected closing ')'");
      return inner;
    }
    if(tok && tok.startsWith('operand')){
      advance();
      return {type:'operand', spec: parseOperandToken(tok)};
    }
    throw new Error(`Expected 'operand...' or '(' at token ${pos}, got '${tok}'`);
  }

  function parseChain(){
    const terms = [parseTerm()];
    const tiers = [];
    while(peek() != null && TIER_NAMES.has(peek())){
      tiers.push(advance());
      terms.push(parseTerm());
    }
    return {type:'chain', terms, tiers};
  }

  const ast = parseChain();
  if(pos !== tokens.length) throw new Error(`Unexpected trailing token '${tokens[pos]}'`);
  return ast;
}

function parseTemplate(str){
  return parseTemplateTokens(tokenizeTemplate(str));
}

// ----------------------------------------------------------------------------
// AST utilities
// ----------------------------------------------------------------------------
// Operand leaf specs, in document (left-to-right) order — this order is what
// both operand-kind resolution and tree-building leaf consumption rely on.
function collectOperandSpecs(ast, out){
  out = out || [];
  if(ast.type === 'operand'){ out.push(ast); return out; }
  ast.terms.forEach(t => collectOperandSpecs(t, out));
  return out;
}
function collectTierKeywords(ast, out){
  out = out || [];
  if(ast.type === 'operand') return out;
  out.push(...ast.tiers);
  ast.terms.forEach(t => collectTierKeywords(t, out));
  return out;
}
// Structural note: by construction of the chain grammar (terms.length ===
// tiers.length+1 at every level, recursively), total operand leaves always
// equals total tier tokens + 1, globally, regardless of nesting. This is
// what eliminates the whole "operandSources doesn't match operatorCount"
// class of bug by construction — see the profile-config-proposal doc.
function profileUsesParens(templateStr){
  return templateStr.includes('(');
}
