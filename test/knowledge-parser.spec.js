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
    expect('ent1 => pred: ent2').parsed.statements.to.deep.include(['_:user/ent1', '_:user/pred', '_:user/ent2'])
  })

  it('002 should attach a property to an identified entity with a semicolon at the end', () => {
    expect('ent1 => pred: ent2 ;').parsed.statements.to.deep.include(['_:user/ent1', '_:user/pred', '_:user/ent2'])
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
        .to.deep.include(['_:user/ent1', '_:user/pred', '_:user/ent2'])
        .and.to.deep.include(['_:user/ent3', '_:user/pred2', '_:user/ent4'])
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
        .to.deep.include(['_:user/ent1', '_:user/p1', '_:user/ent2'])
        .and.to.deep.include(['_:user/ent1', '_:user/p2', '_:user/ent3'])
        .and.to.have.length(2)
    })
  })

  it('005 should support using a property as a subject', () => {
    expect(`
      ent1 => p1: ent2 => attestedBy: ent3
    `).parsed.statements
      .to.deep.include(['_:user/ent1', '_:user/p1', '_:user/ent2'])
      .and.to.deep.include(['_:auto_expr/0', '_:user/attestedBy', '_:user/ent3'])
  })

  it('006 It should support describing a property with multiple properties', () => {
    expect(`
    a => (
      b: c => (
        d: e;
        f: g
      );
    )`).parsed.statements
      .to.deep.include(['_:user/a', '_:user/b', '_:user/c'])
      .and.to.deep.include(['_:auto_expr/0', '_:user/d', '_:user/e'])
      .and.to.deep.include(['_:auto_expr/0', '_:user/f', '_:user/g'])
  })

  it('006.5 should support describing multiple properties', () => {
    expect(`
      a => (
        b:c
        d:e
      ) => f:g
    `).parsed.statements
      .to.deep.include(['_:user/a', '_:user/b', '_:user/c']) // _:auto_expr/0
      .and.to.deep.include(['_:auto_expr/0', '_:user/f', '_:user/g']) // _:auto_expr/1
      .and.to.deep.include(['_:user/a', '_:user/d', '_:user/e']) // _:auto_expr/2
      .and.to.deep.include(['_:auto_expr/2', '_:user/f', '_:user/g']) // _:auto_expr/3
      .and.to.have.length(12) // includes 4 * 2 reification statements
  })

  it('006.6 should support cross product of descriptors with descriptors as citations', () => {
    expect(`
      a => (
        b:c
        d:e
      ) => ( f:g h:i )
    `).parsed.statements
      .to.deep.include(['_:user/a', '_:user/b', '_:user/c']) // _:auto_expr/0
      .and.to.deep.include(['_:auto_expr/0', '_:user/f', '_:user/g']) // _:auto_expr/1
      .and.to.deep.include(['_:auto_expr/0', '_:user/h', '_:user/i']) // _:auto_expr/2
      .and.to.deep.include(['_:user/a', '_:user/d', '_:user/e']) // _:auto_expr/3
      .and.to.deep.include(['_:auto_expr/3', '_:user/f', '_:user/g']) // _:auto_expr/4
      .and.to.deep.include(['_:auto_expr/3', '_:user/h', '_:user/i']) // _:auto_expr/5
      .and.to.have.length(14) // include 4 * 2 auto-reification statements
  })

  it('007 It should support deeply nested descriptions of properties', () => {
    expect(`
    a => (
      b: c => (
        d: e => f:g => j:k
        h: i
      ) => l:m
    )`).parsed.statements
      .to.deep.include(['_:user/a', '_:user/b', '_:user/c']) // _:auto_expr/0
      .and.to.deep.include(['_:auto_expr/0', '_:user/d', '_:user/e']) // _:auto_expr/1
      .and.to.deep.include(['_:auto_expr/1', '_:user/f', '_:user/g']) // _:auto_expr/2
      .and.to.deep.include(['_:auto_expr/2', '_:user/j', '_:user/k']) // _:auto_expr/3
      .and.to.deep.include(['_:auto_expr/1', '_:user/l', '_:user/m']) // _:auto_expr/4
      .and.to.deep.include(['_:auto_expr/0', '_:user/h', '_:user/i']) // _:auto_expr/5
      .and.to.deep.include(['_:auto_expr/5', '_:user/l', '_:user/m']) // _:auto_expr/6
  })

  it('008 should support descriptions of descriptions of properties', () => {
    expect(`
      a => b:c => d:e => e:f
    `).parsed.statements
      .to.deep.include(['_:user/a', '_:user/b', '_:user/c']) // _:auto_expr/0
      .and.to.deep.include(['_:auto_expr/0', '_:user/d', '_:user/e']) // _:auto_expr/1
      .and.to.deep.include(['_:auto_expr/1', '_:user/e', '_:user/f'])
  })

  it('009 should support creation of anonymous objects with automatic identifiers', () => {
    expect(`
      abc&def&ghi => (
        a: b
        c: d
      )
    `).parsed.statements
      .to.deep.include(['_:uniq/abc&def&ghi/0', '_:user/a', '_:user/b'])
      .and.to.deep.include(['_:uniq/abc&def&ghi/0', '_:user/c', '_:user/d'])
  })

  it('010 should support using an anonymous object as a subject', () => {
    expect(`
      (& => (
        a: b
        c: d
      )) => ( e:f; g:h )
    `).parsed.statements
      .to.deep.include(['_:uniq/&/0', '_:user/a', '_:user/b'])
      .and.to.deep.include(['_:uniq/&/0', '_:user/c', '_:user/d'])
      .and.to.deep.include(['_:uniq/&/0', '_:user/e', '_:user/f'])
      .and.to.deep.include(['_:uniq/&/0', '_:user/g', '_:user/h'])
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
      .to.deep.include(['_:uniq/&/0', '_:user/d', '_:user/e'])
      .to.deep.include(['_:uniq/&/0', '_:user/f', '_:user/g'])
      .to.deep.include(['_:user/a', '_:user/b', '_:uniq/&/0'])
  })

  it('011.1 should support an anonymous object as a predicate', () => {
    expect(`a => (& => (
      b: c
      d: e
    )): f`).parsed.statements
      .to.deep.include(['_:user/a', '_:uniq/&/0', '_:user/f'])
      .and.to.deep.include(['_:uniq/&/0', '_:user/b', '_:user/c'])
      .and.to.deep.include(['_:uniq/&/0', '_:user/d', '_:user/e'])
  })

  it('012 should automatically reify statements that are cited', () => {
    expect(`a => c:d => e:f`).parsed.statements
      .to.deep.include(['_:user/a', '_:user/c', '_:user/d'])
      .and.to.deep.include(['_:auto_expr/0', 'rdf:type', 'rdf:Statement'])
      .and.to.deep.include(['_:auto_expr/0', 'rdf:subject', '_:user/a'])
      .and.to.deep.include(['_:auto_expr/0', 'rdf:predicate', '_:user/c'])
      .and.to.deep.include(['_:auto_expr/0', 'rdf:object', '_:user/d'])
      .and.to.deep.include(['_:auto_expr/0', '_:user/e', '_:user/f'])
  })

  it('013 should support an array of identifiers as an object', () => {
    expect(`a => b: (c d)`).parsed.statements
      .to.deep.include(['_:user/a', '_:user/b', '_:user/c'])
      .and.to.deep.include(['_:user/a', '_:user/b', '_:user/d'])
  })

  it('014 should support an array of identifiers as a subject', () => {
    expect(`(a b) => c: d`).parsed.statements
      .to.deep.include(['_:user/a', '_:user/c', '_:user/d'])
      .and.to.deep.include(['_:user/b', '_:user/c', '_:user/d'])
  })

  it('015 should support an array of identifiers as a predicate', () => {
    expect(`a => (b c): d`).parsed.statements
      .to.deep.include(['_:user/a', '_:user/b', '_:user/d'])
      .and.to.deep.include(['_:user/a', '_:user/c', '_:user/d'])
  })

  it('016 should support arrays of identifiers in all slots of a statement', () => {
    expect(`(a b) => (c d) : (e f)`).parsed.statements
      .to.deep.include(['_:user/a', '_:user/c', '_:user/e'])
      .and.to.deep.include(['_:user/a', '_:user/c', '_:user/f'])
      .and.to.deep.include(['_:user/a', '_:user/d', '_:user/e'])
      .and.to.deep.include(['_:user/a', '_:user/d', '_:user/f'])
      .and.to.deep.include(['_:user/b', '_:user/c', '_:user/e'])
      .and.to.deep.include(['_:user/b', '_:user/c', '_:user/f'])
      .and.to.deep.include(['_:user/b', '_:user/d', '_:user/e'])
      .and.to.deep.include(['_:user/b', '_:user/d', '_:user/f'])
  })

  it('017.1 should support named expressions', () => {
    expect(`a => b : c ! d`).parsed.statements
      .to.deep.include(['_:user/a', '_:user/b', '_:user/c'])
      .and.to.deep.include(['_:user/d', 'rdf:subject', '_:user/a'])
      .and.to.deep.include(['_:user/d', 'rdf:predicate', '_:user/b'])
      .and.to.deep.include(['_:user/d', 'rdf:object', '_:user/c'])
  })

  it('017.2 should support named expressions', () => {
    expect(`a => (
        b : c ! d
        e : f ! g => h:i => j:k ! l
      )`).parsed.statements
      .to.deep.include(['_:user/a', '_:user/b', '_:user/c'])
      .to.deep.include(['_:user/a', '_:user/e', '_:user/f'])
      .and.to.deep.include(['_:user/g', '_:user/h', '_:user/i'])
      .and.to.deep.include(['_:auto_expr/0', '_:user/j', '_:user/k'])
      .and.to.deep.include(['_:user/d', 'rdf:subject', '_:user/a'])
      .and.to.deep.include(['_:user/d', 'rdf:predicate', '_:user/b'])
      .and.to.deep.include(['_:user/d', 'rdf:object', '_:user/c'])
      .and.to.deep.include(['_:user/g', 'rdf:subject', '_:user/a'])
      .and.to.deep.include(['_:user/g', 'rdf:predicate', '_:user/e'])
      .and.to.deep.include(['_:user/g', 'rdf:object', '_:user/f'])
      .and.to.deep.include(['_:user/l', 'rdf:subject', '_:auto_expr/0'])
      .and.to.deep.include(['_:user/l', 'rdf:predicate', '_:user/j'])
      .and.to.deep.include(['_:user/l', 'rdf:object', '_:user/k'])
  })

  it('018.0 should support descrptors as variables', () => {
    expect(`
      @x := (a:b c:d)
      y => (
        *x
        e:f
      )
    `).parsed.statements
      .to.deep.include(['_:user/y', '_:user/a', '_:user/b'])
      .to.deep.include(['_:user/y', '_:user/c', '_:user/d'])
      .to.deep.include(['_:user/y', '_:user/e', '_:user/f'])
  })

  it('018.1 should support entities as variables', () => {
    expect(`
      @x := (a b c)
      *x => d:e
    `).parsed.statements
      .to.deep.include(['_:user/a', '_:user/d', '_:user/e'])
      .to.deep.include(['_:user/b', '_:user/d', '_:user/e'])
      .to.deep.include(['_:user/c', '_:user/d', '_:user/e'])
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
      .to.deep.include(['_:user/w', '_:user/a', '_:user/b']) // _:auto_expr/0
      .to.deep.include(['_:auto_expr/0', '_:user/c', '_:user/d']) // _:auto_expr/1
      .to.deep.include(['_:user/w', '_:user/g', '_:user/h']) // _:auto_expr/2
      .to.deep.include(['_:user/y', '_:user/m', '_:user/n']) // _:auto_expr/3
      .to.deep.include(['_:auto_expr/3', '_:user/a', '_:user/b']) // _:auto_expr/4
      .to.deep.include(['_:auto_expr/4', '_:user/c', '_:user/d']) // _:auto_expr/5
      .to.deep.include(['_:auto_expr/3', '_:user/g', '_:user/h']) // _:auto_expr/6
  })

  it('018.3 should support variables inside variables', () => {
    expect(`
      @x := a:b
      @y := (c:d *x e:f)
      w => *y
    `).parsed.statements
      .to.deep.include(['_:user/w', '_:user/c', '_:user/d']) // _:auto_expr/0
      .to.deep.include(['_:user/w', '_:user/a', '_:user/b']) // _:auto_expr/1
      .to.deep.include(['_:user/w', '_:user/e', '_:user/f']) // _:auto_expr/2
  })

  it('018.4 should support variables mixed with other statements', () => {
    expect(`
      a => b:c
      @x := m:n
      w => (*x o:p)
      y => g:h
    `).parsed.statements
      .to.deep.include(['_:user/a', '_:user/b', '_:user/c']) // _:auto_expr/0
      .to.deep.include(['_:user/w', '_:user/m', '_:user/n']) // _:auto_expr/1
      .to.deep.include(['_:user/w', '_:user/o', '_:user/p']) // _:auto_expr/2
      .to.deep.include(['_:user/y', '_:user/g', '_:user/h']) // _:auto_expr/3
  })

  it('018.5 should throw an SyntaxError if an assignment appears in a descriptor', () => {
    expect(() => knowledgeParser.parseString(`
      a => ( a:b @x:=y )
    `)).to.throw(SyntaxError).which.has.property('message').that.matches(/Invalid descriptor.*found assignment: at 2:20$/)
  })
})
