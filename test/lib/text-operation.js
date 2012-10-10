var TextOperation = require('../../lib/text-operation');
var assert = require('assert');
var h = require('./helpers');

function testConstructor () {
  // you should be able to call the constructor without 'new'
  var o = TextOperation();
  assert.strictEqual(o.constructor, TextOperation);
}

function testLengths () {
  var o = new TextOperation();
  assert.strictEqual(0, o.baseLength);
  assert.strictEqual(0, o.targetLength);
  o.retain(5);
  assert.strictEqual(5, o.baseLength);
  assert.strictEqual(5, o.targetLength);
  o.insert("abc");
  assert.strictEqual(5, o.baseLength);
  assert.strictEqual(8, o.targetLength);
  o.retain(2);
  assert.strictEqual(7, o.baseLength);
  assert.strictEqual(10, o.targetLength);
  o.delete(2);
  assert.strictEqual(9, o.baseLength);
  assert.strictEqual(10, o.targetLength);
}

function testChaining () {
  var o = new TextOperation()
    .retain(5)
    .retain(0)
    .insert("lorem")
    .insert("")
    .delete("abc")
    .delete(3)
    .delete(0)
    .delete("");
  assert.strictEqual(3, o.ops.length);
}

function testApply () {
  var str = h.randomString(50);
  var o = h.randomOperation(str);
  assert.strictEqual(str.length, o.baseLength);
  assert.strictEqual(o.apply(str).length, o.targetLength);
}

function testInvert () {
  var str = h.randomString(50);
  var o = h.randomOperation(str);
  var p = o.invert(str);
  assert.strictEqual(o.baseLength, p.targetLength);
  assert.strictEqual(o.targetLength, p.baseLength);
  assert.strictEqual(p.apply(o.apply(str)), str);
}

function testEmptyOps () {
  var o = new TextOperation();
  o.retain(0);
  o.insert('');
  o.delete('');
  assert.strictEqual(0, o.ops.length);
}

function testEquals () {
  var op1 = new TextOperation().delete(1).insert("lo").retain(2).retain(3);
  var op2 = new TextOperation().delete(-1).insert("l").insert("o").retain(5);
  assert.ok(op1.equals(op2));
  op1.delete(1);
  op2.retain(1);
  assert.ok(!op1.equals(op2));
}

function testOpsMerging () {
  function last (arr) { return arr[arr.length-1]; }
  var o = new TextOperation();
  assert.strictEqual(0, o.ops.length);
  o.retain(2);
  assert.strictEqual(1, o.ops.length);
  assert.strictEqual(2, last(o.ops).retain)
  o.retain(3);
  assert.strictEqual(1, o.ops.length);
  assert.strictEqual(5, last(o.ops).retain)
  o.insert("abc");
  assert.strictEqual(2, o.ops.length);
  assert.strictEqual("abc", last(o.ops).insert)
  o.insert("xyz");
  assert.strictEqual(2, o.ops.length);
  assert.strictEqual("abcxyz", last(o.ops).insert)
  o.delete("d");
  assert.strictEqual(3, o.ops.length);
  assert.strictEqual(1, last(o.ops).delete)
  o.delete("d");
  assert.strictEqual(3, o.ops.length);
  assert.strictEqual(2, last(o.ops).delete)
}

function testToString () {
  var o = new TextOperation();
  o.retain(2);
  o.insert('lorem');
  o.delete('ipsum');
  o.retain(5);
  assert.strictEqual("retain 2, insert 'lorem', delete 5, retain 5", o.toString());
}

function testIdJSON () {
  var doc = h.randomString(50);
  var operation = h.randomOperation(doc);
  assert.ok(operation.equals(TextOperation.fromJSON(operation.toJSON())));
}

function testFromJSON () {
  var obj = {
    baseLength: 4,
    targetLength: 5,
    ops: [
      { retain: 2 },
      { delete: "a" },
      { delete: "b" },
      { insert: "cde" }
    ]
  };
  var o = TextOperation.fromJSON(obj);
  assert.strictEqual(3, o.ops.length);
  assert.strictEqual(4, o.baseLength);
  assert.strictEqual(5, o.targetLength);

  function clone (obj) {
    var copy = {};
    for (var name in obj) {
      if (obj.hasOwnProperty(name)) {
        copy[name] = obj[name];
      }
    }
    return copy;
  }

  function assertIncorrectAfter (fn) {
    var obj2 = clone(obj);
    fn(obj2);
    assert.throws(function () { TextOperation.fromJSON(obj2); });
  }

  assertIncorrectAfter(function (obj2) { obj2.baseLength += 1; });
  assertIncorrectAfter(function (obj2) { obj2.targetLength -= 1; });
  assertIncorrectAfter(function (obj2) { obj2.ops.push({ insert: 'x' }); });
  assertIncorrectAfter(function (obj2) { obj2.ops.push({ lorem: 'no such operation' }); });
}

function testCompose () {
  // invariant: apply(str, compose(a, b)) === apply(apply(str, a), b)
  var str = h.randomString(20);
  var a = h.randomOperation(str);
  var afterA = a.apply(str);
  assert.strictEqual(a.targetLength, afterA.length);
  var b = h.randomOperation(afterA);
  var afterB = b.apply(afterA);
  assert.strictEqual(b.targetLength, afterB.length);
  var ab = a.compose(b);
  assert.strictEqual(ab.meta, a.meta);
  assert.strictEqual(ab.targetLength, b.targetLength);
  var afterAB = ab.apply(str);
  if (afterB !== afterAB) {
    throw new Error(
      "compose error; str: " + str + ", a: " + a + ", b: " + b
    );
  }
}

function testTransform () {
  // invariant: apply(str, compose(a, b')) = apply(compose(b, a'))
  // where (a', b') = transform(a, b)
  var str = h.randomString(20);
  var a = h.randomOperation(str);
  var b = h.randomOperation(str);
  var primes = TextOperation.transform(a, b);
  var aPrime = primes[0];
  var bPrime = primes[1];
  var abPrime = a.compose(bPrime);
  var baPrime = b.compose(aPrime);
  var afterAbPrime = abPrime.apply(str);
  var afterBaPrime = baPrime.apply(str);
  if (afterAbPrime !== afterBaPrime) {
    throw new Error(
      "transform error; str: " + str + ", a: " + a + ", b: " + b
    );
  }
}

exports.run = function () {
  var n = 500;
  testConstructor();
  testLengths();
  testChaining();
  testEmptyOps();
  testEquals();
  testOpsMerging();
  testToString();
  testIdJSON();
  testFromJSON();
  h.times(n, testApply);
  h.times(n, testInvert);
  h.times(n, testCompose);
  h.times(n, testTransform);
};