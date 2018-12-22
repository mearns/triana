const fs = require('fs').promises
const Tokenizer = require('tokenizr')
const tokenParser = require('./parser')

function main () {
  fs.readFile('./data-gathering.rdf')
    .then(buffer => buffer.toString('UTF-8'))
    .then(parseString)
}

function acceptMatch (type) {
  return (ctx, match) => ctx.accept(type, match[0])
}

function acceptWithOutValue (type) {
  return ctx => ctx.accept(type, undefined)
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
    const id = `auto_expr:${this._nextExprId}`
    this._nextExprId++
    this._add(id, subj, pred, obj, specified)
    return id
  }

  addReifiedStatement (subj, pred, obj, specified = null) {
    const statementId = this.addStatement(subj, pred, obj, specified)
    const reifBaseId = `auto_reify:${this._nextReifId}`
    this._nextReifId++
    this._add(`${reifBaseId}.s`, statementId, 'stmt_reification:subject', subj, specified)
    this._add(`${reifBaseId}.p`, statementId, 'stmt_reification:predicate', pred, specified)
    this._add(`${reifBaseId}.o`, statementId, 'stmt_reification:object', obj, specified)
    return statementId
  }

  _getNextEntId () {
    const id = this._nextEntId
    this._nextEntId++
    return id
  }

  createEntityIdentifier (userProvided) {
    if (userProvided) {
      if (/&/.test(userProvided)) {
        return `uniq:${userProvided.replace(/&/g, () => this._getNextEntId())}`
      } else {
        return `user:${userProvided}`
      }
    } else {
      return `auto_ent:${this._getNextEntId}`
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
  return new SyntaxError(`Invalid ${context}: expected ${expected}, but found ${symbol} at ${symbol.lex.line}:${symbol.lex.column}`)
}

function handleBySymbolId (symbol, context, handlerMap) {
  const handler = handlerMap[symbol.id]
  if (!handler) {
    throw unexpectedSymbol(symbol, context, Object.keys(handlerMap))
  }
  return handler()
}

function addPropertyToIdentifier (database, firstTokenSymbol, identifier, propertySymbol) {
  if (propertySymbol.pendingProperties && propertySymbol.pendingProperties.length) {
    const statementId = database.addReifiedStatement(identifier, propertySymbol.predicate, propertySymbol.object, firstTokenSymbol.lex)
    propertySymbol.pendingProperties.forEach(pendingProp => {
      addPropertyToIdentifier(database, pendingProp, statementId, pendingProp)
    })
    return [statementId]
  } else {
    const statementId = database.addStatement(identifier, propertySymbol.predicate, propertySymbol.object, firstTokenSymbol.lex)
    return [statementId]
  }
}

function parseString (string) {
  const lex = new Tokenizer()
    .rule(/[a-zA-Z0-9_@&-]+/, acceptMatch('identifier'))
    .rule(/\s*=>\s*/, acceptWithOutValue('ARROW'))
    .rule(/\s*:\s*/, acceptWithOutValue('COLON'))
    .rule(/\s*\(\s*/, acceptWithOutValue('OPAREN'))
    .rule(/\s*\)\s*/, acceptWithOutValue('CPAREN'))
    .rule(/[\s;]+/, acceptMatch('TERMINATOR'))
    .debug(false)
    .input(string)

  const database = new RdfDatabase()

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
            expectSymbol(right, 'entities', 'entities')
            left.ids.push(...right.ids)
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
        }
      })
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
  parser.symbol('COLON', 60)
    .led((left) => {
      const firstToken = parser.peek()
      expectSymbol(left, 'predicate for property (colon) operator', 'entities')
      const right = parser.expression(60)
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

  const program = parser.parse()
  console.log('PPP', program)
  database.statements().forEach(stmt => console.log('Statement: ', stmt))
  return database
}

module.exports = {
  main,
  parseString
}
