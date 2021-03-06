const fs = require('fs').promises
const Tokenizer = require('tokenizr')
const tokenParser = require('./parser')

function main () {
  fs.readFile('./data-gathering.rdf')
    .then(buffer => buffer.toString('UTF-8'))
    .then(parseString)
}

function acceptMatch (type, number = 0) {
  return (ctx, match) => ctx.accept(type, match[number])
}

function acceptWithOutValue (type) {
  return ctx => ctx.accept(type, undefined)
}

class TrianaSyntaxError extends SyntaxError {
  constructor (message, token) {
    const lex = token && (token.lex || token)
    const specificMessage = lex
      ? `${message}: at ${lex.line}:${lex.column}`
      : message
    super(specificMessage)
    this.name = this.constructor.name
    Error.captureStackTrace(this, this.constructor)
    this.line = (lex || {}).line
    this.column = (lex || {}).column
  }
}

class RdfDatabase {
  constructor () {
    this._statements = []
    this._specifications = {}
    this._nextExprId = 0
    this._nextEntId = 0
    this._nextReifId = 0
  }

  _add (id, subj, pred, obj, specified = null) {
    this._statements.push([id, subj, pred, obj])
    this._specifications[id] = specified
  }

  addStatement (subj, pred, obj, specified = null) {
    const id = `_:auto_expr/${this._nextExprId}`
    this._nextExprId++
    this._add(id, subj, pred, obj, specified)
    return id
  }

  addReifiedStatement (id, subj, pred, obj, specified = null) {
    if (id) {
      this._add(id, subj, pred, obj, specified)
    } else {
      id = this.addStatement(subj, pred, obj, specified)
    }
    const reifBaseId = `_:auto_reify/${this._nextReifId}`
    this._nextReifId++
    this._add(`${reifBaseId}.t`, id, 'rdf:type', 'rdf:Statement', specified)
    this._add(`${reifBaseId}.s`, id, 'rdf:subject', subj, specified)
    this._add(`${reifBaseId}.p`, id, 'rdf:predicate', pred, specified)
    this._add(`${reifBaseId}.o`, id, 'rdf:object', obj, specified)
    return id
  }

  _getNextEntId () {
    const id = this._nextEntId
    this._nextEntId++
    return id
  }

  createEntityIdentifier (userProvided) {
    if (userProvided) {
      if (userProvided.startsWith('&')) {
        return `_:uniq/${userProvided.substr(1)}/${this._getNextEntId()}`
      } else {
        return `_:user/${userProvided}`
      }
    } else {
      return `_:auto_ent/${this._getNextEntId()}`
    }
  }

  statements () {
    return this._statements
  }

  forSubject (subj) {
    const db = new RdfDatabase()
    db._statements = this._statements.filter(stmt => stmt[1] === subj)
    // TODO: this could be more selective
    db._specifications = { ...this._specifications }
    db._nextEntId = this._nextEntId
    db._nextExprId = this._nextExprId
    db._nextReifId = this._nextReifId
    return db
  }
}

function expectSymbol (symbol, context, ...expectedIds) {
  if (!expectedIds.some(id => id === symbol.id)) {
    throw unexpectedSymbol(symbol, context, expectedIds)
  }
}

function unexpectedSymbol (symbol, context, _expectedIds) {
  const expectedIds = _expectedIds.map(id => `'${id}'`)
  const expected = expectedIds.length === 1
    ? expectedIds[0]
    : expectedIds.length === 2
      ? expectedIds.join(' or ')
      : [...expectedIds.slice(0, expectedIds.length - 1), 'or ' + expectedIds[expectedIds.length - 1]].join(', ')
  return new TrianaSyntaxError(`Invalid ${context}: expected ${expected}, but found ${symbol}`, symbol)
}

function handleBySymbolId (symbol, context, handlerMap) {
  const handler = handlerMap[symbol.id]
  if (!handler) {
    throw unexpectedSymbol(symbol, context, Object.keys(handlerMap))
  }
  return handler()
}

function addPropertyToIdentifier (database, firstTokenSymbol, identifier, propertySymbol) {
  if ((propertySymbol.pendingProperties && propertySymbol.pendingProperties.length) || propertySymbol.statementId) {
    const statementId = database.addReifiedStatement(propertySymbol.statementId, identifier, propertySymbol.predicate, propertySymbol.object, firstTokenSymbol.lex)
    ;(propertySymbol.pendingProperties || []).forEach(pendingProp => {
      addPropertyToIdentifier(database, pendingProp, statementId, pendingProp)
    })
    return [statementId]
  } else {
    const statementId = database.addStatement(identifier, propertySymbol.predicate, propertySymbol.object, firstTokenSymbol.lex)
    return [statementId]
  }
}

function parseString (string) {
  const PN_CHARS_BASE = 'A-Za-z\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u02ff\u0370-\u037d\u037f-\u1fff\u200c\u200d\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd'
  const PN_CHARS_PLANE_1 = '[\uD800-\uDB7F][\uDC00-\uDFFF]'
  const BLANK_NODE_ANYWHERE = `_0-9${PN_CHARS_BASE}`
  const BLANK_NODE_TAIL_CHARS = `\u00b7\u0300-\u036f\u203f\u2040${BLANK_NODE_ANYWHERE}-`
  const BLANK_NODE_INNER_CHARS = `.${BLANK_NODE_TAIL_CHARS}`
  const DELIMETER_CHARS = ':=!()\\s;'
  const TERMINATOR_RE = `[${DELIMETER_CHARS}]|$`
  const NAME_INIT_RE = `(?:[${BLANK_NODE_ANYWHERE}]|${PN_CHARS_PLANE_1})`
  const NAME_INNER_RE = `(?:[${BLANK_NODE_INNER_CHARS}]|${PN_CHARS_PLANE_1})`
  const NAME_TAIL_RE = `(?:[${BLANK_NODE_TAIL_CHARS}]|${PN_CHARS_PLANE_1})`
  const NAME_RE = `${NAME_INIT_RE}(?:${NAME_INNER_RE}*${NAME_TAIL_RE})?(?=${TERMINATOR_RE})`
  const lex = new Tokenizer()
    .rule(new RegExp('&?' + NAME_RE, 'u'), acceptMatch('identifier'))
    .rule(new RegExp(`&(?=${TERMINATOR_RE})`, 'u'), acceptMatch('identifier'))
    .rule(new RegExp('@(' + NAME_RE + ')', 'u'), acceptMatch('variableName', 1))
    .rule(new RegExp('\\*(' + NAME_RE + ')', 'u'), acceptMatch('variableRef', 1))
    .rule(/\s*:=\s*/, acceptWithOutValue('ASSIGNMENT'))
    .rule(/\s*=>\s*/, acceptWithOutValue('ARROW'))
    .rule(/\s*:\s*/, acceptWithOutValue('COLON'))
    .rule(/\s*!\s*/, acceptWithOutValue('BANG'))
    .rule(/\s*\(\s*/, acceptWithOutValue('OPAREN'))
    .rule(/\s*\)\s*/, acceptWithOutValue('CPAREN'))
    .rule(/[\s;]+/, acceptMatch('TERMINATOR'))
    .debug(process.env.DEBUG)
    .input(string)

  const database = new RdfDatabase()
  const varTable = {}

  const parser = tokenParser(lex)
  ;['EOF', 'CPAREN'].forEach(sym => parser.symbol(sym))

  // Lexical grouping only.
  parser.symbol('TERMINATOR', 1)
    .nud(() => {
      const next = parser.peek()
      if (next && (next.id === 'EOF' || next.id === 'CPAREN')) {
        return
      }
      return parser.expression(0)
    })
    .led(left => {
      const next = parser.peek()
      if (next && (next.id === 'EOF' || next.id === 'CPAREN')) {
        return left
      }
      return handleBySymbolId(left, 'expression', {
        entities: () => {
          const right = parser.expression(1)
          if (right) {
            handleBySymbolId(right, 'entities', {
              entities: () => {
                left.ids.push(...right.ids)
              },
              assignment: () => {}
            })
          }
          return left
        },
        descriptor: () => {
          const right = parser.expression(1)
          if (right) {
            expectSymbol(right, 'descriptor', 'descriptor')
            left.properties.push(...right.properties)
          }
          return left
        },
        assignment: () => {
          const next = parser.peek()
          if (next && (next.id === 'EOF' || next.id === 'CPAREN')) {
            return
          }
          return parser.expression(0)
        }
      })
    })
  parser.symbol('ASSIGNMENT', 2)
    .led(function (left) {
      expectSymbol(left, 'assignment symbol', 'variableName')
      const varName = left.value
      if (varTable[varName]) {
        throw new TrianaSyntaxError(`Variable is already defined: '${varName}'`, left)
      }
      const right = parser.expression(2)
      expectSymbol(right, 'right hand side of assignment', 'entities', 'descriptor')
      varTable[varName] = right
      return parser.create('assignment', this)
        .raw()
    })
  parser.symbol('OPAREN', 100)
    .nud(() => {
      const expression = parser.expression(0)
      parser.advance('CPAREN')
      return expression
    })
  parser.symbol('identifier')
    .nud(function () {
      const id = database.createEntityIdentifier(this.value)
      return parser.create('entities', this)
        .prop('ids', [ id ])
        .raw()
    })
  parser.symbol('variableName')
    .nud(function () {
      return this
    })
  parser.symbol('variableRef')
    .nud(function () {
      const value = varTable[this.value]
      if (value) {
        return value
      }
      throw new TrianaSyntaxError(`Variable is not defined: '${this.value}'`, this)
    })
  parser.symbol('ARROW', 50)
    .led(function (left) {
      return handleBySymbolId(left, 'subject (left hand operand) for arrow operator', {
        entities: () => {
          const right = parser.expression(49)
          expectSymbol(right, 'target (right hand operand) for description (arrow) operator', 'descriptor')
          left.ids.forEach(subj => {
            right.properties.forEach(prop => addPropertyToIdentifier(database, this, subj, prop))
          })
          return left
        },
        descriptor: () => {
          const right = parser.expression(49)
          expectSymbol(right, 'target (right hand operand) for citation (arrow) operator', 'descriptor')
          left.properties.forEach(prop => {
            prop.pendingProperties = prop.pendingProperties || []
            prop.pendingProperties.push(...right.properties)
          })
          return left
        }
      })
    })
  parser.symbol('COLON', 70)
    .led((left) => {
      const firstToken = parser.peek()
      expectSymbol(left, 'predicate for property (colon) operator', 'entities')
      const right = parser.expression(70)
      expectSymbol(right, 'object for a property (colon) operator', 'entities')
      const properties = []
      left.ids.forEach(pred => {
        right.ids.forEach(obj => {
          properties.push(parser.create('property', left)
            .prop('predicate', pred)
            .prop('object', obj)
            .raw())
        })
      })
      return parser.create('descriptor', firstToken)
        .prop('properties', properties)
        .raw()
    })
  parser.symbol('BANG', 60)
    .led((left) => {
      expectSymbol(left, 'statement for labeling (bang) operator', 'descriptor')
      if (left.properties.length !== 1) {
        throw new TrianaSyntaxError(`Statement labeling can only target a single property, found ${left.properties.length}`, left)
      }
      const [targetProperty] = left.properties
      const right = parser.expression(60)
      expectSymbol(right, 'label for labeling (bang) operator', 'entities')
      if (right.ids.length !== 1) {
        throw new TrianaSyntaxError(`Statement labeling can only use a single entity, found ${right.ids.length}`, right)
      }
      const [labelId] = right.ids
      targetProperty.statementId = labelId
      return left
    })

  const program = parser.parse()
  console.log('PPP', program)
  database.statements().forEach(stmt => console.log('Statement: ', stmt))
  return database
}

module.exports = {
  main,
  parseString
}
