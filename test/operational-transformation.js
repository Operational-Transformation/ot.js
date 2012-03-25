var ot = require('../lib/operational-transformation');
var h = require('./helpers');

function testIDGeneration () {
  var seen = {};
  var n = 500;
  while (n--) {
    var o = new ot.Operation(0);
    if (seen[o.id]) {
      throw new Error("id collision");
    }
    seen[o.id] = true;
  }
}

function testLengths () {
  var o = new ot.Operation(0);
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
  o.delete("xy");
  h.assertEqual(9, o.baseLength);
  h.assertEqual(10, o.targetLength);
}

function testApply () {
  var str = h.randomString(50);
  var o = h.randomOperation(0, str);
  h.assertEqual(str.length, o.baseLength);
  h.assertEqual(ot.apply(str, o).length, o.targetLength);
}

function testOpsMerging () {
  function last (arr) { return arr[arr.length-1]; }
  var o = new ot.Operation(0);
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
  h.assertEqual("d", last(o.ops).delete)
  o.delete("d");
  h.assertEqual(3, o.ops.length);
  h.assertEqual("dd", last(o.ops).delete)
}

function testToString () {
  var o = new ot.Operation(0);
  o.retain(2);
  o.insert('lorem');
  o.delete('ipsum');
  o.retain(5);
  h.assertEqual("retain 2, insert 'lorem', delete 'ipsum', retain 5", o.toString());
}

function testFromJSON () {
  var obj = {
    id: '1234',
    revision: 3,
    baseLength: 4,
    targetLength: 5,
    ops: [
      { retain: 2 },
      { delete: "a" },
      { delete: "b" },
      { insert: "cde" }
    ]
  };
  var o = ot.Operation.fromJSON(obj);
  h.assertEqual('1234', o.id);
  h.assertEqual(3, o.revision);
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
    h.assertThrows(function () { ot.Operation.fromJSON(obj2); });
  }

  assertIncorrectAfter(function (obj2) { delete obj2.id; });
  assertIncorrectAfter(function (obj2) { obj2.revision = -42; })
  assertIncorrectAfter(function (obj2) { obj2.baseLength += 1; });
  assertIncorrectAfter(function (obj2) { obj2.targetLength -= 1; })
  assertIncorrectAfter(function (obj2) { obj2.ops.push({ insert: 'x' }); });
  assertIncorrectAfter(function (obj2) { obj2.ops.push({ lorem: 'no such operation' }); });
}

function testCompose () {
  // invariant: apply(str, compose(a, b)) === apply(apply(str, a), b)
  var str = h.randomString(20);
  var a = h.randomOperation(0, str);
  var afterA = ot.apply(str, a);
  h.assertEqual(a.targetLength, afterA.length);
  var b = h.randomOperation(1, afterA);
  var afterB = ot.apply(afterA, b);
  h.assertEqual(b.targetLength, afterB.length);
  var ab = ot.compose(a, b);
  h.assertEqual(ab.targetLength, b.targetLength);
  var afterAB = ot.apply(str, ab);
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
  var a = h.randomOperation(0, str);
  var b = h.randomOperation(0, str);
  var abPrime = ot.transform(a, b);
  var aPrime = abPrime[0];
  var bPrime = abPrime[1];
  h.assertEqual(1, aPrime.revision);
  h.assertEqual(a.id, aPrime.id);
  h.assertEqual(1, bPrime.revision);
  h.assertEqual(b.id, bPrime.id);
  var abPrime = ot.compose(a, bPrime);
  var baPrime = ot.compose(b, aPrime);
  var afterAbPrime = ot.apply(str, abPrime);
  var afterBaPrime = ot.apply(str, baPrime);
  if (afterAbPrime !== afterBaPrime) {
    throw new Error(
      "transform error; str: " + str + ", a: " + a + ", b: " + b
    );
  }
}

exports.run = function () {
  var n = 500;
  testIDGeneration();
  testLengths();
  testOpsMerging();
  testToString();
  testFromJSON();
  h.times(n, testApply);
  h.times(n, testCompose);
  h.times(n, testTransform);
};