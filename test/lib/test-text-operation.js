var TextOperation = require('../../lib/text-operation');
var h = require('../helpers');

var n = 500;

exports.testConstructor = function (test) {
  // you should be able to call the constructor without 'new'
  var o = TextOperation();
  test.strictEqual(o.constructor, TextOperation);
  test.done();
};

exports.testLengths = function (test) {
  var o = new TextOperation();
  test.strictEqual(0, o.baseLength);
  test.strictEqual(0, o.targetLength);
  o.retain(5);
  test.strictEqual(5, o.baseLength);
  test.strictEqual(5, o.targetLength);
  o.insert("abc");
  test.strictEqual(5, o.baseLength);
  test.strictEqual(8, o.targetLength);
  o.retain(2);
  test.strictEqual(7, o.baseLength);
  test.strictEqual(10, o.targetLength);
  o['delete'](2);
  test.strictEqual(9, o.baseLength);
  test.strictEqual(10, o.targetLength);
  test.done();
};

exports.testChaining = function (test) {
  var o = new TextOperation()
    .retain(5)
    .retain(0)
    .insert("lorem")
    .insert("")
    ['delete']("abc")
    ['delete'](3)
    ['delete'](0)
    ['delete']("");
  test.strictEqual(3, o.ops.length);
  test.done();
};

exports.testApply = h.randomTest(n, function (test) {
  var str = h.randomString(50);
  var o = h.randomOperation(str);
  test.strictEqual(str.length, o.baseLength);
  test.strictEqual(o.apply(str).length, o.targetLength);
});

exports.testInvert = h.randomTest(n, function (test) {
  var str = h.randomString(50);
  var o = h.randomOperation(str);
  var p = o.invert(str);
  test.strictEqual(o.baseLength, p.targetLength);
  test.strictEqual(o.targetLength, p.baseLength);
  test.strictEqual(p.apply(o.apply(str)), str);
});

exports.testEmptyOps = function (test) {
  var o = new TextOperation();
  o.retain(0);
  o.insert('');
  o['delete']('');
  test.strictEqual(0, o.ops.length);
  test.done();
};

exports.testEquals = function (test) {
  var op1 = new TextOperation()['delete'](1).insert("lo").retain(2).retain(3);
  var op2 = new TextOperation()['delete'](-1).insert("l").insert("o").retain(5);
  test.ok(op1.equals(op2));
  op1['delete'](1);
  op2.retain(1);
  test.ok(!op1.equals(op2));
  test.done();
};

exports.testOpsMerging = function (test) {
  function last (arr) { return arr[arr.length-1]; }
  var o = new TextOperation();
  test.strictEqual(0, o.ops.length);
  o.retain(2);
  test.strictEqual(1, o.ops.length);
  test.strictEqual(2, last(o.ops));
  o.retain(3);
  test.strictEqual(1, o.ops.length);
  test.strictEqual(5, last(o.ops));
  o.insert("abc");
  test.strictEqual(2, o.ops.length);
  test.strictEqual("abc", last(o.ops));
  o.insert("xyz");
  test.strictEqual(2, o.ops.length);
  test.strictEqual("abcxyz", last(o.ops));
  o['delete']("d");
  test.strictEqual(3, o.ops.length);
  test.strictEqual(-1, last(o.ops));
  o['delete']("d");
  test.strictEqual(3, o.ops.length);
  test.strictEqual(-2, last(o.ops));
  test.done();
};

exports.testIsNoop = function (test) {
  var o = new TextOperation();
  test.ok(o.isNoop());
  o.retain(5);
  test.ok(o.isNoop());
  o.retain(3);
  test.ok(o.isNoop());
  o.insert("lorem");
  test.ok(!o.isNoop());
  test.done();
};

exports.testToString = function (test) {
  var o = new TextOperation();
  o.retain(2);
  o.insert('lorem');
  o['delete']('ipsum');
  o.retain(5);
  test.strictEqual("retain 2, insert 'lorem', delete 5, retain 5", o.toString());
  test.done();
};

exports.testIdJSON = h.randomTest(n, function (test) {
  var doc = h.randomString(50);
  var operation = h.randomOperation(doc);
  test.ok(operation.equals(TextOperation.fromJSON(operation.toJSON())));
});

exports.testFromJSON = function (test) {
  var ops = [2, -1, -1, 'cde'];
  var o = TextOperation.fromJSON(ops);
  test.strictEqual(3, o.ops.length);
  test.strictEqual(4, o.baseLength);
  test.strictEqual(5, o.targetLength);

  function assertIncorrectAfter (fn) {
    var ops2 = ops.slice(0);
    fn(ops2);
    test.throws(function () { TextOperation.fromJSON(ops2); });
  }

  assertIncorrectAfter(function (ops2) { ops2.push({ insert: 'x' }); });
  assertIncorrectAfter(function (ops2) { ops2.push(null); });
  test.done();
};

exports.testShouldBeComposedWith = function (test) {
  function make () { return new TextOperation(); }
  var a, b;

  a = make().retain(3);
  b = make().retain(1).insert("tag").retain(2);
  test.ok(a.shouldBeComposedWith(b));
  test.ok(b.shouldBeComposedWith(a));

  a = make().retain(1).insert("a").retain(2);
  b = make().retain(2).insert("b").retain(2);
  test.ok(a.shouldBeComposedWith(b));
  a['delete'](3);
  test.ok(!a.shouldBeComposedWith(b));

  a = make().retain(1).insert("b").retain(2);
  b = make().retain(1).insert("a").retain(3);
  test.ok(!a.shouldBeComposedWith(b));

  a = make().retain(4)['delete'](3).retain(10);
  b = make().retain(2)['delete'](2).retain(10);
  test.ok(a.shouldBeComposedWith(b));
  b = make().retain(4)['delete'](7).retain(3);
  test.ok(a.shouldBeComposedWith(b));
  b = make().retain(2)['delete'](9).retain(3);
  test.ok(!a.shouldBeComposedWith(b));

  test.done();
};

exports.testShouldBeComposedWithInverted = h.randomTest(2*n, function (test) {
  // invariant: shouldBeComposedWith(a, b) = shouldBeComposedWithInverted(b^{-1}, a^{-1})
  var str = h.randomString();
  var a = h.randomOperation(str);
  var aInv = a.invert(str);
  var afterA = a.apply(str);
  var b = h.randomOperation(afterA);
  var bInv = b.invert(afterA);
  test.strictEqual(a.shouldBeComposedWith(b), bInv.shouldBeComposedWithInverted(aInv));
});

exports.testCompose = h.randomTest(n, function (test) {
  // invariant: apply(str, compose(a, b)) === apply(apply(str, a), b)
  var str = h.randomString(20);
  var a = h.randomOperation(str);
  var afterA = a.apply(str);
  test.strictEqual(a.targetLength, afterA.length);
  var b = h.randomOperation(afterA);
  var afterB = b.apply(afterA);
  test.strictEqual(b.targetLength, afterB.length);
  var ab = a.compose(b);
  test.strictEqual(ab.meta, a.meta);
  test.strictEqual(ab.targetLength, b.targetLength);
  var afterAB = ab.apply(str);
  test.strictEqual(afterB, afterAB);
});

exports.testTransform = h.randomTest(n, function (test) {
  // invariant: compose(a, b') = compose(b, a')
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
  test.ok(abPrime.equals(baPrime));
  test.strictEqual(afterAbPrime, afterBaPrime);
});
