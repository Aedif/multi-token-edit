function tokenizeQuery(input) {
  const raw = [];
  let current = '';

  const pushCurrent = () => {
    if (current.trim()) raw.push(current);
    current = '';
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (ch === '(' || ch === ')') {
      pushCurrent();
      raw.push(ch);
    } else if (ch === '"') {
      // start of a quoted term
      pushCurrent();
      i++; // move past opening "
      let buf = '';
      while (i < input.length && input[i] !== '"') {
        buf += input[i];
        i++;
      }
      // i is now at closing " or end-of-input; we ignore unterminated-for-now
      raw.push('"' + buf + '"');
    } else if (/\s/.test(ch)) {
      pushCurrent();
    } else {
      current += ch;
    }
  }
  pushCurrent();

  const tokens = [];
  for (let w of raw) {
    if (w === '(') {
      tokens.push({ type: 'LPAREN' });
      continue;
    }
    if (w === ')') {
      tokens.push({ type: 'RPAREN' });
      continue;
    }

    const upper = w.toUpperCase();
    if (upper === 'AND') {
      tokens.push({ type: 'AND' });
      continue;
    }
    if (upper === 'OR') {
      tokens.push({ type: 'OR' });
      continue;
    }

    // Atoms
    // Negative tag: -#oak
    if (w.startsWith('-#')) {
      tokens.push({ type: 'NOT_TAG', value: w.slice(2).toLowerCase() });
      continue;
    }
    // Tag: #tree
    if (w.startsWith('#')) {
      tokens.push({ type: 'TAG', value: w.slice(1).toLowerCase() });
      continue;
    }

    // Negative type: -@Tile
    if (w.startsWith('-@')) {
      tokens.push({ type: 'NOT_TYPE', value: w.slice(2) });
      continue;
    }
    // Type: @Tile
    if (w.startsWith('@')) {
      tokens.push({ type: 'TYPE', value: w.slice(1) });
      continue;
    }

    // Negative plain term: -red or -"red tree"
    if (w.startsWith('-')) {
      const inner = w.slice(1);
      if (inner.startsWith('"') && inner.endsWith('"')) {
        // -"red tree"  -> NOT_TERM with value 'red tree'
        tokens.push({
          type: 'NOT_TERM',
          value: inner.slice(1, -1).toLowerCase(),
        });
      } else {
        tokens.push({ type: 'NOT_TERM', value: inner.toLowerCase() });
      }
      continue;
    }

    // Plain or quoted term: red OR "red tree"
    if (w.startsWith('"') && w.endsWith('"')) {
      tokens.push({
        type: 'TERM',
        value: w.slice(1, -1).toLowerCase(),
      });
    } else {
      tokens.push({
        type: 'TERM',
        value: w.toLowerCase(),
      });
    }
  }

  return tokens;
}

function parseQuery(tokens) {
  let i = 0;

  function peek() {
    return tokens[i] || null;
  }

  function consume(expectedType) {
    const tok = tokens[i];
    if (!tok || (expectedType && tok.type !== expectedType)) {
      throw new Error(`Expected ${expectedType} but found ${tok ? tok.type : 'EOF'}`);
    }
    i++;
    return tok;
  }

  function isAtomToken(tok) {
    if (!tok) return false;
    return ['TERM', 'NOT_TERM', 'TAG', 'NOT_TAG', 'TYPE', 'NOT_TYPE'].includes(tok.type);
  }

  function parseExpression() {
    return parseOr();
  }

  function parseOr() {
    let node = parseAnd();
    while (peek() && peek().type === 'OR') {
      consume('OR');
      const right = parseAnd();
      node = { type: 'OR', left: node, right };
    }
    return node;
  }

  function parseAnd() {
    let node = parsePrimary();

    while (true) {
      const tok = peek();
      if (!tok) break;

      if (tok.type === 'AND') {
        // Explicit AND
        consume('AND');
        const right = parsePrimary();
        node = { type: 'AND', left: node, right };
      } else if (tok.type === 'LPAREN' || isAtomToken(tok)) {
        // Implicit AND (just whitespace between terms)
        const right = parsePrimary();
        node = { type: 'AND', left: node, right };
      } else {
        break;
      }
    }

    return node;
  }

  function parsePrimary() {
    const tok = peek();
    if (!tok) {
      throw new Error('Unexpected end of input in primary');
    }

    if (tok.type === 'LPAREN') {
      consume('LPAREN');
      const expr = parseExpression();
      consume('RPAREN');
      return expr;
    }

    if (isAtomToken(tok)) {
      return parseAtom();
    }

    throw new Error(`Unexpected token in primary: ${tok.type}`);
  }

  function parseAtom() {
    const tok = consume(); // any atom token type
    switch (tok.type) {
      case 'TERM':
        return { type: 'ATOM', field: 'name', value: tok.value, negated: false };
      case 'NOT_TERM':
        return { type: 'ATOM', field: 'name', value: tok.value, negated: true };
      case 'TAG':
        return { type: 'ATOM', field: 'tag', value: tok.value, negated: false };
      case 'NOT_TAG':
        return { type: 'ATOM', field: 'tag', value: tok.value, negated: true };
      case 'TYPE':
        return { type: 'ATOM', field: 'type', value: tok.value, negated: false };
      case 'NOT_TYPE':
        return { type: 'ATOM', field: 'type', value: tok.value, negated: true };
      default:
        throw new Error(`Unknown atom token type: ${tok.type}`);
    }
  }

  const ast = parseExpression();
  if (peek()) {
    throw new Error(`Unexpected extra tokens after parse: ${peek().type}`);
  }
  return ast;
}

function isNameOnlyAst(node) {
  if (node.type === 'ATOM') {
    return node.field === 'name';
  }
  if (node.type === 'AND' || node.type === 'OR') {
    return isNameOnlyAst(node.left) && isNameOnlyAst(node.right);
  }
  return false; // shouldn't happen, but safe default
}

function compileAstToPredicate(ast) {
  const nameOnly = isNameOnlyAst(ast);

  function build(node) {
    if (node.type === 'AND') {
      const left = build(node.left);
      const right = build(node.right);
      return (entry, ctx) => left(entry, ctx) && right(entry, ctx);
    }

    if (node.type === 'OR') {
      const left = build(node.left);
      const right = build(node.right);
      return (entry, ctx) => left(entry, ctx) || right(entry, ctx);
    }

    if (node.type === 'ATOM') {
      const { field, value, negated } = node;

      if (field === 'name') {
        // substring on name (case-insensitive)
        if (!negated) {
          return (entry, ctx) => ctx.lcName.includes(value);
        } else {
          return (entry, ctx) => !ctx.lcName.includes(value);
        }
      }

      if (field === 'tag') {
        if (value === 'null') {
          // #NULL => tags.length === 0
          return (entry, ctx) => (negated ? ctx.lcTags.length !== 0 : ctx.lcTags.length === 0);
        }

        // tag membership (case-insensitive)
        return (entry, ctx) => {
          const tags = ctx.lcTags;
          const has = tags.includes(value);
          return negated ? !has : has;
        };
      }

      if (field === 'type') {
        // type match (case-sensitive here; tweak if you want)
        if (!negated) {
          return (entry) => entry.documentName === value;
        } else {
          return (entry) => entry.documentName !== value;
        }
      }

      throw new Error(`Unknown atom field: ${field}`);
    }

    throw new Error(`Unknown AST node type: ${node.type}`);
  }

  const evalNode = build(ast);

  return function matcher(entry, folder) {
    if (folder) {
      if (nameOnly) {
        const fCtx = {
          lcName: folder.name.toLowerCase(),
          lcTags: [], // irrelevant: no tag/type atoms in a name-only AST
        };
        return evalNode(folder, fCtx);
      }
      return false;
    }

    const lcName = entry.name.toLowerCase();
    const lcTags = (entry.tags || []).map((t) => t.toLowerCase());
    const ctx = { lcName, lcTags };

    return evalNode(entry, ctx);
  };
}

export function buildQueryMatcher(queryString) {
  const tokens = tokenizeQuery(queryString);
  if (!tokens.length) {
    // Empty query
    return null;
  }
  try {
    const ast = parseQuery(tokens);
    return compileAstToPredicate(ast);
  } catch (e) {}
  return null;
}
