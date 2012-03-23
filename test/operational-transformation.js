var ot = require('../lib/operational-transformation');

function randomInt (n) {
  return Math.floor(Math.random() * n);
}

function randomString (n) {
  var str = '';
  while (n--) {
    var chr = randomInt(26) + 97;
    str = str + String.fromCharCode(chr);
  }
  return str;
}

function randomOperation (rev, str) {
  var operation = new ot.Operation(rev);
  var left;
  while (left = str.length - operation.baseLength) {
    var r = Math.random();
    var l = 1 + randomInt(Math.min(left, 20));
    if (r < 0.2) {
      operation.insert(randomString(l));
    } else if (r < 0.4) {
      operation.delete(str.slice(operation.baseLength, operation.baseLength + l));
    } else {
      operation.skip(l);
    }
  }
  if (Math.random() < 0.3) {
    operation.insert(1 + randomString(10));
  }
  return operation;
}

function times (n, fun) {
  while (n--) {
    fun();
  }
}

function assert (b, msg) {
  if (!b) {
    throw new Error(msg || "assertion error");
  }
}

function assertEqual (a, b) {
  if (a !== b) {
    throw new Error("assertion error: " + a + " !== " + b);
  }
}

function testLengths () {
  var o = new ot.Operation(0);
  assertEqual(0, o.baseLength);
  assertEqual(0, o.targetLength);
  o.skip(5);
  assertEqual(5, o.baseLength);
  assertEqual(5, o.targetLength);
  o.insert("abc");
  assertEqual(5, o.baseLength);
  assertEqual(8, o.targetLength);
  o.skip(2);
  assertEqual(7, o.baseLength);
  assertEqual(10, o.targetLength);
  o.delete("xy");
  assertEqual(9, o.baseLength);
  assertEqual(10, o.targetLength);
}

function testOpsMerging () {
  function last (arr) { return arr[arr.length-1]; }
  var o = new ot.Operation(0);
  assertEqual(0, o.ops.length);
  o.skip(2);
  assertEqual(1, o.ops.length);
  assertEqual(2, last(o.ops).skip)
  o.skip(3);
  assertEqual(1, o.ops.length);
  assertEqual(5, last(o.ops).skip)
  o.insert("abc");
  assertEqual(2, o.ops.length);
  assertEqual("abc", last(o.ops).insert)
  o.insert("xyz");
  assertEqual(2, o.ops.length);
  assertEqual("abcxyz", last(o.ops).insert)
  o.delete("d");
  assertEqual(3, o.ops.length);
  assertEqual("d", last(o.ops).delete)
  o.delete("d");
  assertEqual(3, o.ops.length);
  assertEqual("dd", last(o.ops).delete)
}

function testCompose () {
  // invariant: apply(str, compose(a, b)) === apply(apply(str, a), b)
  var str = randomString(20);
  var a = randomOperation(0, str);
  var afterA = ot.apply(str, a);
  assertEqual(a.targetLength, afterA.length);
  var b = randomOperation(1, afterA);
  var afterB = ot.apply(afterA, b);
  assertEqual(b.targetLength, afterB.length);
  var ab = ot.compose(a, b);
  assertEqual(ab.targetLength, b.targetLength);
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
  var str = randomString(20);
  var a = randomOperation(0, str);
  var b = randomOperation(0, str);
  var abPrime = ot.transform(a, b);
  var aPrime = abPrime[0];
  var bPrime = abPrime[1];
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

function testAll () {
  var n = 500;
  testLengths();
  testOpsMerging();
  times(n, testCompose);
  times(n, testTransform);
}

testAll();