var Cursor = require('../../lib/cursor');
var TextOperation = require('../../lib/text-operation');

exports.testFromJSON = function (test) {
  var cursor = Cursor.fromJSON({ position: 3, selectionEnd: 5 });
  test.ok(cursor instanceof Cursor);
  test.strictEqual(cursor.position, 3);
  test.strictEqual(cursor.selectionEnd, 5);
  test.done();
};

exports.testTransform = function (test) {
  var cursor = new Cursor(3, 7);
  test.ok(cursor
    .transform(new TextOperation().retain(3).insert('lorem')['delete'](2).retain(42))
    .equals(new Cursor(8, 10)));
  test.ok(cursor
    .transform(new TextOperation()['delete'](45))
    .equals(new Cursor(0, 0)));
  test.done();
};

exports.testCompose = function (test) {
  var a = new Cursor(3, 7);
  var b = new Cursor(4, 4);
  test.strictEqual(a.compose(b), b);
  test.done();
};