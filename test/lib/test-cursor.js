var Cursor = require('../../lib/cursor');
var TextOperation = require('../../lib/text-operation');

exports.testFromJSON = function (test) {
  var cursor = Cursor.fromJSON({ position: 3, selection: [{ anchor: 3, head: 5 }, { anchor: 11, head: 23 }] });
  test.ok(cursor instanceof Cursor);
  test.strictEqual(cursor.position, 3);
  test.strictEqual(cursor.selection.length, 2);
  test.ok(cursor.selection[0].equals(new Cursor.Range(3, 5)));
  test.ok(cursor.selection[1].equals(new Cursor.Range(11, 23)));
  test.done();
};

exports.testSomethingSelected = function (test) {
  var cursor = new Cursor(7, [new Cursor.Range(7, 7), new Cursor.Range(10,10)]);
  test.ok(!cursor.somethingSelected());
  cursor = new Cursor(10, [new Cursor.Range(7, 10)]);
  test.ok(cursor.somethingSelected());
  test.done();
};

exports.testTransform = function (test) {
  var cursor = new Cursor(3, [new Cursor.Range(3, 7)]);
  test.ok(cursor
    .transform(new TextOperation().retain(3).insert('lorem')['delete'](2).retain(42))
    .equals(new Cursor(8, [new Cursor.Range(8, 10)])));
  test.ok(cursor
    .transform(new TextOperation()['delete'](45))
    .equals(new Cursor(0, [])));
  test.done();
};

exports.testCompose = function (test) {
  var a = new Cursor(3, [new Cursor.Range(3, 7)]);
  var b = new Cursor(4, []);
  test.strictEqual(a.compose(b), b);
  test.done();
};