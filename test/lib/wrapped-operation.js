var WrappedOperation = require('../../lib/wrapped-operation');
var h = require('../helpers');

var n = 20;

exports.testApply = h.randomTest(n, function (test) {
  var str = h.randomString(50);
  var operation = h.randomOperation(str);
  var wrapped = new WrappedOperation(operation, { lorem: 42 });
  test.strictEqual(wrapped.meta.lorem, 42);
  test.strictEqual(wrapped.apply(str), operation.apply(str));
});

exports.testInvert = h.randomTest(n, function (test) {
  var str = h.randomString(50);
  var operation = h.randomOperation(str);
  var payload = { lorem: 'ipsum' };
  var wrapped = new WrappedOperation(operation, payload);
  var wrappedInverted = wrapped.invert(str);
  test.strictEqual(wrappedInverted.meta, payload);
  test.strictEqual(str, wrappedInverted.apply(operation.apply(str)));
});

exports.testCompose = h.randomTest(n, function (test) {
  var str = h.randomString(50);
  var a = new WrappedOperation(h.randomOperation(str), { a: 1, b: 2 });
  var strN = a.apply(str);
  var b = new WrappedOperation(h.randomOperation(strN), { a: 3, c: 4 });
  var ab = a.compose(b);
  test.strictEqual(ab.meta.a, 3);
  test.strictEqual(ab.meta.b, 2);
  test.strictEqual(ab.meta.c, 4);
  test.strictEqual(ab.apply(str), b.apply(strN));
});

exports.testTransform = h.randomTest(n, function (test) {
  var str = h.randomString(50);
  var metaA = {};
  var a = new WrappedOperation(h.randomOperation(str), metaA);
  var metaB = {};
  var b = new WrappedOperation(h.randomOperation(str), metaB);
  var pair = WrappedOperation.transform(a, b);
  var aPrime = pair[0];
  var bPrime = pair[1];
  test.strictEqual(aPrime.meta, metaA);
  test.strictEqual(bPrime.meta, metaB);
  test.strictEqual(aPrime.apply(b.apply(str)), bPrime.apply(a.apply(str)));
});
