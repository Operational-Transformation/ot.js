var WrappedOperation = require('../../lib/wrapped-operation');
var assert = require('assert');
var h = require('./helpers');

function testApply () {
  var str = h.randomString(50);
  var operation = h.randomOperation(str);
  var wrapped = new WrappedOperation(operation, { lorem: 42 });
  assert.strictEqual(wrapped.meta.lorem, 42);
  assert.strictEqual(wrapped.apply(str), operation.apply(str));
}

function testInvert () {
  var str = h.randomString(50);
  var operation = h.randomOperation(str);
  var payload = { lorem: 'ipsum' };
  var wrapped = new WrappedOperation(operation, payload);
  var wrappedInverted = wrapped.invert(str);
  assert.strictEqual(wrappedInverted.meta, payload);
  assert.strictEqual(str, wrappedInverted.apply(operation.apply(str)));
}

function testCompose () {
  var str = h.randomString(50);
  var a = new WrappedOperation(h.randomOperation(str), { a: 1, b: 2 });
  var strN = a.apply(str);
  var b = new WrappedOperation(h.randomOperation(strN), { a: 3, c: 4 });
  var ab = a.compose(b);
  assert.strictEqual(ab.meta.a, 3);
  assert.strictEqual(ab.meta.b, 2);
  assert.strictEqual(ab.meta.c, 4);
  assert.strictEqual(ab.apply(str), b.apply(strN));
}

function testTransform () {
  var str = h.randomString(50);
  var metaA = {};
  var a = new WrappedOperation(h.randomOperation(str), metaA);
  var metaB = {};
  var b = new WrappedOperation(h.randomOperation(str), metaB);
  var pair = WrappedOperation.transform(a, b);
  var aPrime = pair[0];
  var bPrime = pair[1];
  assert.strictEqual(aPrime.meta, metaA);
  assert.strictEqual(bPrime.meta, metaB);
  assert.strictEqual(aPrime.apply(b.apply(str)), bPrime.apply(a.apply(str)));
}

exports.run = function () {
  var n = 20;
  h.times(n, testApply);
  h.times(n, testInvert);
  h.times(n, testCompose);
  h.times(n, testTransform);
};