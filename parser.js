const chalk = require('chalk')

const _symbol = {
  _isSymbol: true,
  id: '(_symbol_)',
  nud: function () {
    throw new Error(`Symbol is undefined: ${this}`)
  },
  led: function () {
    throw new Error(`Operator is undefined: ${this}`)
  },
  toString: function () {
    if (typeof this.value !== 'undefined') {
      return `${this.id}:${this.value}`
    }
    return this.id
  }
}

function symbolApi (symbol) {
  const api = {
    nud: (func) => {
      symbol.nud = func
      return api
    },
    led: (func) => {
      symbol.led = func
      return api
    },
    _raw: () => {
      return symbol
    }
  }
  return api
}

function entityApi (symbol) {
  const api = {
    prop: (name, value) => {
      symbol[name] = value
      return api
    },
    raw: () => {
      return symbol
    }
  }
  return api
}

function tokenParser (lexer) {
  return new TokenParser(lexer)._api
}

class TokenParser {
  constructor (lexer) {
    this._symbols = {}
    this._tokens = lexer.tokens()

    this._api = ['expression', 'advance', 'optional', 'symbol', 'peek', 'parse', 'create'].reduce((api, methodName) => {
      api[methodName] = this[`_${methodName}`].bind(this)
      return api
    }, {})
    this._tabs = ['| ']
    if (!process.env.DEBUG) {
      this._log = () => {}
    }
  }

  /**
   * Get or create a symbol, and return it.
   */
  _symbol (id, bp = 0) {
    let sym = this._symbols[id]
    if (sym) {
      sym.lbp = Math.max(sym.lbp, bp)
    } else {
      sym = Object.create(_symbol)
      sym.id = id
      sym.lbp = bp
      this._log(`Creating new symbol '${id}'`, { sym })
      this._symbols[id] = sym
    }
    return symbolApi(sym)
  }

  _create (symbolId, source) {
    const sym = Object.create(this._symbol(symbolId)._raw())
    if (source) {
      sym.lex = source.lex
    }
    return entityApi(sym)
  }

  _log (message, ...metas) {
    const meta = Object.assign({}, ...metas)
    console.log(`${String(this._tabs.length).padStart(6, ' ')} ${this._tabs.join('')}${chalk.blue(message)}: ${JSON.stringify(meta)}`)
  }

  _indent () {
    this._tabs.push('| ')
  }

  _outdent () {
    this._tabs.pop()
  }

  /**
   * Move to the next token, which is parsed into a symbol and returned, as a symbol.
   * If the parameter is given, the current token's `id` must equal the given value, or
   * an error is thrown.
   */
  _advance (expectedId) {
    if (this._token && this._token.id === 'EOF') {
      throw new SyntaxError('Cannot advance, already at the end of the file')
    }
    if (expectedId && this._token.id !== expectedId) {
      throw new SyntaxError(`Expected a token of type ${expectedId}, found ${this._token}`)
    }
    const t = this._tokens.shift()
    const symb = this._symbols[t.type]
    if (!symb) {
      throw new Error(`No symbol defined for token of type ${t.type}`)
    }
    this._token = Object.create(symb)
    this._token.value = t.value
    this._token.lex = { text: t.text, line: t.line, column: t.column }
    return this._token
  }

  _optional (id) {
    if (this._token.id === id) {
      this._advance()
    }
  }

  _peek () {
    return this._token
  }

  _expression (rbp) {
    let left
    let t
    const firstToken = t = this._token
    this._advance()
    this._log(`Beginning expression with (${t})`, { t, rbp, nextToken: this._token })
    this._indent()
    this._log(`Invoking nud for leading token (${t})`, { t })
    this._indent()
    left = t.nud()
    this._outdent()
    this._log(`Result of nud on (${t}) is (${left})`, { t, nudResult: left })
    while (rbp < this._token.lbp) {
      t = this._token
      this._advance()
      this._log(`Advanced to next token (${t}), invoking led`, { t, nextToken: this._token, ingoingLeft: left })
      this._indent()
      left = t.led(left)
      this._outdent()
      this._log(`Completed led on (${t}) is (${left})`, { t, nextToken: this._token, ledResult: left })
    }
    this._outdent()
    this._log(`Completed parsing expression beginning with (${firstToken}), because next token is (${this._token}) with lbp ${this._token.lbp}, and rbp was ${rbp}. Result is (${left})`, { firstToken, result: left })
    return left
  }

  _parse () {
    this._advance()
    const expressions = []
    while (this._token.id !== 'EOF') {
      const expression = this._expression(0)
      expressions.push(expression)
    }
    return expressions
  }
}

module.exports = tokenParser
tokenParser.itself = function () {
  return this
}
