function codeMirrorChangeToOperation (cm, change, oldValue) {
  var ot = operational_transformation;
  var operation = new ot.Operation(0);
  var newValue = cm.getValue();
  var from = cm.indexFromPos(change.from);
  var text = change.text.join('\n');
  var diff = newValue.length - oldValue.length;
  var deletedChars = text.length - diff;

  if (from > 0) {
    operation.skip(from);
  }
  if (deletedChars > 0) {
    operation.delete(oldValue.slice(from, from + deletedChars));
  }
  if (text) {
    operation.insert(text);
  }
  if (oldValue.length - operation.baseLength > 0) {
    operation.skip(oldValue.length - operation.baseLength);
  }

  return operation;
}