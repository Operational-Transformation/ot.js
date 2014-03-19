var SimpleTextOperation = require('../../lib/simple-text-operation');
var h = require('../helpers');

var n = 500;

var Insert = SimpleTextOperation.Insert;
var Delete = SimpleTextOperation.Delete;
var Noop   = SimpleTextOperation.Noop;

function randomSimpleTextOperation (doc) {
  if (Math.random() < 0.5) {
    return new Insert(
      h.randomString(1 + h.randomInt(10)),
      h.randomInt(doc.length + 1)
    );
  }

  if (doc.length === 0 || Math.random() < 0.2) { return new Noop(); }

  var position = h.randomInt(doc.length);
  var count = 1 + h.randomInt(Math.min(10, doc.length - position));
  return Delete(count, position);
}

exports.testApply = function (test) {
  test.strictEqual("Hallo Welt!", new Insert("Welt", 6).apply("Hallo !"));
  test.strictEqual("Hallo !", new Delete(4, 6).apply("Hallo Welt!"));
  test.strictEqual("Hallo Welt!", new Noop().apply("Hallo Welt!"));
  test.done();
};

exports.testTransform = h.randomTest(n, function (test) {
  var doc = h.randomString(15);
  var a = randomSimpleTextOperation(doc);
  var b = randomSimpleTextOperation(doc);
  var abPrime = SimpleTextOperation.transform(a, b);
  if (abPrime[0].apply(b.apply(doc)) !== abPrime[1].apply(a.apply(doc))) {
    console.log("------------------------");
    console.log(doc);
    console.log(a.toString());
    console.log(b.toString());
    console.log(abPrime[0].toString());
    console.log(abPrime[1].toString());
  }
  test.strictEqual(abPrime[0].apply(b.apply(doc)), abPrime[1].apply(a.apply(doc)));
});

exports.testFromTextOperation = h.randomTest(n, function (test) {
  var doc = h.randomString(40);
  var operation = h.randomOperation(doc);
  var doc1 = operation.apply(doc);
  var simpleOperations = SimpleTextOperation.fromTextOperation(operation);
  for (var i = 0; i < simpleOperations.length; i++) {
    doc = simpleOperations[i].apply(doc);
  }
  test.strictEqual(doc1, doc);
});