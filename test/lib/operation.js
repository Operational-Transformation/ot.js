var Operation = require('../../lib/operation');
var h = require('./helpers');

function testLengths () {
  var o = new Operation(0);
  h.assertEqual(0, o.baseLength);
  h.assertEqual(0, o.targetLength);
  o.retain(5);
  h.assertEqual(5, o.baseLength);
  h.assertEqual(5, o.targetLength);
  o.insert("abc");
  h.assertEqual(5, o.baseLength);
  h.assertEqual(8, o.targetLength);
  o.retain(2);
  h.assertEqual(7, o.baseLength);
  h.assertEqual(10, o.targetLength);
  o.delete(2);
  h.assertEqual(9, o.baseLength);
  h.assertEqual(10, o.targetLength);
}

function testChaining () {
  var o = new Operation(0)
    .retain(5)
    .retain(0)
    .insert("lorem")
    .insert("")
    .delete("abc")
    .delete(3)
    .delete(0)
    .delete("");
  h.assertEqual(3, o.ops.length);
}

function testApply () {
  var str = h.randomString(50);
  var o = h.randomOperation(str);
  h.assertEqual(str.length, o.baseLength);
  h.assertEqual(o.apply(str).length, o.targetLength);
}

function testInvert () {
  var str = h.randomString(50);
  var o = h.randomOperation(str);
  var p = o.invert(str);
  h.assertEqual(o.baseLength, p.targetLength);
  h.assertEqual(o.targetLength, p.baseLength);
  h.assertEqual(p.apply(o.apply(str)), str);
}

function testEmptyOps () {
  var o = new Operation(0);
  o.retain(0);
  o.insert('');
  o.delete('');
  h.assertEqual(0, o.ops.length);
}

function testOpsMerging () {
  function last (arr) { return arr[arr.length-1]; }
  var o = new Operation(0);
  h.assertEqual(0, o.ops.length);
  o.retain(2);
  h.assertEqual(1, o.ops.length);
  h.assertEqual(2, last(o.ops).retain)
  o.retain(3);
  h.assertEqual(1, o.ops.length);
  h.assertEqual(5, last(o.ops).retain)
  o.insert("abc");
  h.assertEqual(2, o.ops.length);
  h.assertEqual("abc", last(o.ops).insert)
  o.insert("xyz");
  h.assertEqual(2, o.ops.length);
  h.assertEqual("abcxyz", last(o.ops).insert)
  o.delete("d");
  h.assertEqual(3, o.ops.length);
  h.assertEqual(1, last(o.ops).delete)
  o.delete("d");
  h.assertEqual(3, o.ops.length);
  h.assertEqual(2, last(o.ops).delete)
}

function testToString () {
  var o = new Operation(0);
  o.retain(2);
  o.insert('lorem');
  o.delete('ipsum');
  o.retain(5);
  h.assertEqual("retain 2, insert 'lorem', delete 5, retain 5", o.toString());
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
  var o = Operation.fromJSON(obj);
  h.assertEqual(3, o.ops.length);
  h.assertEqual(4, o.baseLength);
  h.assertEqual(5, o.targetLength);

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
    h.assertThrows(function () { Operation.fromJSON(obj2); });
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
  h.assertEqual(a.targetLength, afterA.length);
  var b = h.randomOperation(afterA);
  var afterB = b.apply(afterA);
  h.assertEqual(b.targetLength, afterB.length);
  var ab = a.compose(b);
  h.assertEqual(ab.meta, a.meta);
  h.assertEqual(ab.targetLength, b.targetLength);
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
  var primes = Operation.transform(a, b);
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
  testLengths();
  testChaining();
  testEmptyOps();
  testOpsMerging();
  testToString();
  testFromJSON();
  h.times(n, testApply);
  h.times(n, testInvert);
  h.times(n, testCompose);
  h.times(n, testTransform);
};