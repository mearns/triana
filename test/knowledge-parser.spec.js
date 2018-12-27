/* eslint-env mocha */

// Module under test
const knowledgeParser = require('../knowledge-parser')

// support
const chai = require('chai')
const { expect } = chai

chai.use((_chai, utils) => {
  _chai.Assertion.addProperty('statements', function () {
    utils.flag(this, 'object', this._obj.statements().map(record => record.slice(1)))
  })
  _chai.Assertion.addProperty('parsed', function () {
    utils.flag(this, 'object', knowledgeParser.parseString(this._obj))
  })
  _chai.Assertion.addMethod('forSubject', function (subj) {
    utils.flag(this, 'object', this._obj.forSubject(subj))
  })
})

describe('knowledge-parser', () => {
  it('001 should attach a property to an identified entity', () => {
    expect('ent1 => pred: ent2').parsed.statements.to.deep.include(['user:ent1', 'user:pred', 'user:ent2'])
  })

  it('002 should attach a property to an identified entity with a semicolon at the end', () => {
    expect('ent1 => pred: ent2 ;').parsed.statements.to.deep.include(['user:ent1', 'user:pred', 'user:ent2'])
  })

  ;[
    '  ',
    '; ',
    ' ;',
    ';;'
  ].forEach((pattern, idx) => {
    it(`003-${idx} should define multiple statements on multiple lines with pattern '${pattern}'`, () => {
      expect(`
        ent1 => pred: ent2 ${pattern[0]}
        ent3 => pred2: ent4 ${pattern[1]}
      `).parsed.statements
        .to.deep.include(['user:ent1', 'user:pred', 'user:ent2'])
        .and.to.deep.include(['user:ent3', 'user:pred2', 'user:ent4'])
        .and.to.have.length(2)
    })
  })

  ;[
    '  ',
    '; ',
    ' ;',
    ';;'
  ].forEach((pattern, idx) => {
    it(`004-${idx} should define multiple properties for a single subject, with pattern '${pattern}'`, () => {
      expect(`
        ent1 => (
          p1: ent2 ${pattern[0]}
          p2: ent3 ${pattern[1]}
        )
      `).parsed.statements
        .to.deep.include(['user:ent1', 'user:p1', 'user:ent2'])
        .and.to.deep.include(['user:ent1', 'user:p2', 'user:ent3'])
        .and.to.have.length(2)
    })
  })

  it('005 should support using a property as a subject', () => {
    expect(`
      ent1 => p1: ent2 => attestedBy: ent3
    `).parsed.statements
      .to.deep.include(['user:ent1', 'user:p1', 'user:ent2'])
      .and.to.deep.include(['auto_expr:0', 'user:attestedBy', 'user:ent3'])
  })

  it('006 It should support describing a property with multiple properties', () => {
    expect(`
    a => (
      b: c => (
        d: e;
        f: g
      );
    )`).parsed.statements
      .to.deep.include(['user:a', 'user:b', 'user:c'])
      .and.to.deep.include(['auto_expr:0', 'user:d', 'user:e'])
      .and.to.deep.include(['auto_expr:0', 'user:f', 'user:g'])
  })

  it('006.5 should support describing multiple properties', () => {
    expect(`
      a => (
        b:c
        d:e
      ) => f:g
    `).parsed.statements
      .to.deep.include(['user:a', 'user:b', 'user:c']) // auto_expr:0
      .and.to.deep.include(['auto_expr:0', 'user:f', 'user:g']) // auto_expr:1
      .and.to.deep.include(['user:a', 'user:d', 'user:e']) // auto_expr:2
      .and.to.deep.include(['auto_expr:2', 'user:f', 'user:g']) // auto_expr:3
      .and.to.have.length(10) // includes 3 * 2 reification statements
  })

  it('006.6 should support cross product of descriptors with descriptors as citations', () => {
    expect(`
      a => (
        b:c
        d:e
      ) => ( f:g h:i )
    `).parsed.statements
      .to.deep.include(['user:a', 'user:b', 'user:c']) // auto_expr:0
      .and.to.deep.include(['auto_expr:0', 'user:f', 'user:g']) // auto_expr:1
      .and.to.deep.include(['auto_expr:0', 'user:h', 'user:i']) // auto_expr:2
      .and.to.deep.include(['user:a', 'user:d', 'user:e']) // auto_expr:3
      .and.to.deep.include(['auto_expr:3', 'user:f', 'user:g']) // auto_expr:4
      .and.to.deep.include(['auto_expr:3', 'user:h', 'user:i']) // auto_expr:5
      .and.to.have.length(12) // include 3 * 2 auto-reification statements
  })

  it('007 It should support deeply nested descriptions of properties', () => {
    expect(`
    a => (
      b: c => (
        d: e => f:g => j:k
        h: i
      ) => l:m
    )`).parsed.statements
      .to.deep.include(['user:a', 'user:b', 'user:c']) // auto_expr:0
      .and.to.deep.include(['auto_expr:0', 'user:d', 'user:e']) // auto_expr:1
      .and.to.deep.include(['auto_expr:1', 'user:f', 'user:g']) // auto_expr:2
      .and.to.deep.include(['auto_expr:2', 'user:j', 'user:k']) // auto_expr:3
      .and.to.deep.include(['auto_expr:1', 'user:l', 'user:m']) // auto_expr:4
      .and.to.deep.include(['auto_expr:0', 'user:h', 'user:i']) // auto_expr:5
      .and.to.deep.include(['auto_expr:5', 'user:l', 'user:m']) // auto_expr:6
  })

  it('008 should support descriptions of descriptions of properties', () => {
    expect(`
      a => b:c => d:e => e:f
    `).parsed.statements
      .to.deep.include(['user:a', 'user:b', 'user:c']) // auto_expr:0
      .and.to.deep.include(['auto_expr:0', 'user:d', 'user:e']) // auto_expr:1
      .and.to.deep.include(['auto_expr:1', 'user:e', 'user:f'])
  })

  it('009 should support creation of anonymous objects with automatic identifiers', () => {
    expect(`
      abc&def&ghi => (
        a: b
        c: d
      )
    `).parsed.statements
      .to.deep.include(['uniq:abc0def1ghi', 'user:a', 'user:b'])
      .and.to.deep.include(['uniq:abc0def1ghi', 'user:c', 'user:d'])
  })

  it('010 should support using an anonymous object as a subject', () => {
    expect(`
      (& => (
        a: b
        c: d
      )) => ( e:f; g:h )
    `).parsed.statements
      .to.deep.include(['uniq:0', 'user:a', 'user:b'])
      .and.to.deep.include(['uniq:0', 'user:c', 'user:d'])
      .and.to.deep.include(['uniq:0', 'user:e', 'user:f'])
      .and.to.deep.include(['uniq:0', 'user:g', 'user:h'])
  })

  it('011 should support an anonymous object as an object', () => {
    expect(`
      a => (
        b: (& => (
          d: e
          f: g
        ))
      )
    `).parsed.statements
      .to.deep.include(['uniq:0', 'user:d', 'user:e'])
      .to.deep.include(['uniq:0', 'user:f', 'user:g'])
      .to.deep.include(['user:a', 'user:b', 'uniq:0'])
  })

  it('011.1 should support an anonymous object as a predicate', () => {
    expect(`a => (& => (
      b: c
      d: e
    )): f`).parsed.statements
      .to.deep.include(['user:a', 'uniq:0', 'user:f'])
      .and.to.deep.include(['uniq:0', 'user:b', 'user:c'])
      .and.to.deep.include(['uniq:0', 'user:d', 'user:e'])
  })

  it('012 should automatically reify statements that are cited', () => {
    expect(`a => c:d => e:f`).parsed.statements
      .to.deep.include(['user:a', 'user:c', 'user:d'])
      .and.to.deep.include(['auto_expr:0', 'stmt_reification:subject', 'user:a'])
      .and.to.deep.include(['auto_expr:0', 'stmt_reification:predicate', 'user:c'])
      .and.to.deep.include(['auto_expr:0', 'stmt_reification:object', 'user:d'])
      .and.to.deep.include(['auto_expr:0', 'user:e', 'user:f'])
  })

  it('013 should support an array of identifiers as an object', () => {
    expect(`a => b: (c d)`).parsed.statements
      .to.deep.include(['user:a', 'user:b', 'user:c'])
      .and.to.deep.include(['user:a', 'user:b', 'user:d'])
  })

  it('014 should support an array of identifiers as a subject', () => {
    expect(`(a b) => c: d`).parsed.statements
      .to.deep.include(['user:a', 'user:c', 'user:d'])
      .and.to.deep.include(['user:b', 'user:c', 'user:d'])
  })

  it('015 should support an array of identifiers as a predicate', () => {
    expect(`a => (b c): d`).parsed.statements
      .to.deep.include(['user:a', 'user:b', 'user:d'])
      .and.to.deep.include(['user:a', 'user:c', 'user:d'])
  })

  it('016 should support arrays of identifiers in all slots of a statement', () => {
    expect(`(a b) => (c d) : (e f)`).parsed.statements
      .to.deep.include(['user:a', 'user:c', 'user:e'])
      .and.to.deep.include(['user:a', 'user:c', 'user:f'])
      .and.to.deep.include(['user:a', 'user:d', 'user:e'])
      .and.to.deep.include(['user:a', 'user:d', 'user:f'])
      .and.to.deep.include(['user:b', 'user:c', 'user:e'])
      .and.to.deep.include(['user:b', 'user:c', 'user:f'])
      .and.to.deep.include(['user:b', 'user:d', 'user:e'])
      .and.to.deep.include(['user:b', 'user:d', 'user:f'])
  })

  it('017.1 should support named expressions', () => {
    expect(`a => b : c ! d`).parsed.statements
      .to.deep.include(['user:a', 'user:b', 'user:c'])
      .and.to.deep.include(['user:d', 'stmt_reification:subject', 'user:a'])
      .and.to.deep.include(['user:d', 'stmt_reification:predicate', 'user:b'])
      .and.to.deep.include(['user:d', 'stmt_reification:object', 'user:c'])
  })

  it('017.2 should support named expressions', () => {
    expect(`a => (
        b : c ! d
        e : f ! g => h:i => j:k ! l
      )`).parsed.statements
      .to.deep.include(['user:a', 'user:b', 'user:c'])
      .to.deep.include(['user:a', 'user:e', 'user:f'])
      .and.to.deep.include(['user:g', 'user:h', 'user:i'])
      .and.to.deep.include(['auto_expr:0', 'user:j', 'user:k'])
      .and.to.deep.include(['user:d', 'stmt_reification:subject', 'user:a'])
      .and.to.deep.include(['user:d', 'stmt_reification:predicate', 'user:b'])
      .and.to.deep.include(['user:d', 'stmt_reification:object', 'user:c'])
      .and.to.deep.include(['user:g', 'stmt_reification:subject', 'user:a'])
      .and.to.deep.include(['user:g', 'stmt_reification:predicate', 'user:e'])
      .and.to.deep.include(['user:g', 'stmt_reification:object', 'user:f'])
      .and.to.deep.include(['user:l', 'stmt_reification:subject', 'auto_expr:0'])
      .and.to.deep.include(['user:l', 'stmt_reification:predicate', 'user:j'])
      .and.to.deep.include(['user:l', 'stmt_reification:object', 'user:k'])
  })

  it('018.0 should support descrptors as variables', () => {
    expect(`
      @x := (a:b c:d)
      y => (
        *x
        e:f
      )
    `).parsed.statements
      .to.deep.include(['user:y', 'user:a', 'user:b'])
      .to.deep.include(['user:y', 'user:c', 'user:d'])
      .to.deep.include(['user:y', 'user:e', 'user:f'])
  })

  it('018.1 should support entities as variables', () => {
    expect(`
      @x := (a b c)
      *x => d:e
    `).parsed.statements
      .to.deep.include(['user:a', 'user:d', 'user:e'])
      .to.deep.include(['user:b', 'user:d', 'user:e'])
      .to.deep.include(['user:c', 'user:d', 'user:e'])
  })

  it('018.2 should support statements about statements in variables', () => {
    expect(`
      @x := (
        a:b => c:d
        g:h
      )
      w => *x
      y => m:n => *x
    `).parsed.statements
      .to.deep.include(['user:w', 'user:a', 'user:b']) // auto_expr:0
      .to.deep.include(['auto_expr:0', 'user:c', 'user:d']) // auto_expr:1
      .to.deep.include(['user:w', 'user:g', 'user:h']) // auto_expr:2
      .to.deep.include(['user:y', 'user:m', 'user:n']) // auto_expr:3
      .to.deep.include(['auto_expr:3', 'user:a', 'user:b']) // auto_expr:4
      .to.deep.include(['auto_expr:4', 'user:c', 'user:d']) // auto_expr:5
      .to.deep.include(['auto_expr:3', 'user:g', 'user:h']) // auto_expr:6
  })

  it('018.3 should support variables inside variables', () => {
    expect(`
      @x := a:b
      @y := (c:d *x e:f)
      w => *y
    `).parsed.statements
      .to.deep.include(['user:w', 'user:c', 'user:d']) // auto_expr:0
      .to.deep.include(['user:w', 'user:a', 'user:b']) // auto_expr:1
      .to.deep.include(['user:w', 'user:e', 'user:f']) // auto_expr:2
  })

  it('018.4 should support variables mixed with other statements', () => {
    expect(`
      a => b:c
      @x := m:n
      w => (*x o:p)
      y => g:h
    `).parsed.statements
      .to.deep.include(['user:a', 'user:b', 'user:c']) // auto_expr:0
      .to.deep.include(['user:w', 'user:m', 'user:n']) // auto_expr:1
      .to.deep.include(['user:w', 'user:o', 'user:p']) // auto_expr:2
      .to.deep.include(['user:y', 'user:g', 'user:h']) // auto_expr:3
  })

  it('018.5 should throw an SyntaxError if an assignment appears in a descriptor', () => {
    expect(() => knowledgeParser.parseString(`
      a => ( a:b @x:=y )
    `)).to.throw(SyntaxError).which.has.property('message').that.matches(/Invalid descriptor.*found assignment: at 2:20$/)
  })
})
