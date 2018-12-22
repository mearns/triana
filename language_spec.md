# Language Spec

## BNF-ish

```bnf
entities: <identity> | <description> | <entities> [ [ <term> ] [ <entity> ] ]

description: <entities> '=>' <descriptor>

descriptor: <prop> [ [ <term> ] [ <prop>] ]

prop: <entities> ':' <entities> [ '=>' <prop> ]
```