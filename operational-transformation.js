var operational_transformation = (function () {

  function Operation (baseRevision, ops) {
    assert(typeof baseRevision === 'number' && baseRevision >= 0);
    this.baseRevision = baseRevision;
    this.ops = ops || [];
    this.baseLength = 0;
    this.targetLength = 0;
  }

  Operation.prototype.skip = function (n) {
    assert(n > 0);
    this.baseLength += n;
    this.targetLength += n;
    this.ops.push({ skip: n });
  };

  Operation.prototype.insert = function (str) {
    assert(str);
    this.targetLength += str.length;
    this.ops.push({ insert: str });
  };

  Operation.prototype.delete = function (str) {
    assert(str);
    this.baseLength += str.length;
    this.ops.push({ delete: str });
  };

  function apply (str, operation) {
    var newStr = [], j = 0;
    var strIndex = 0;
    var ops = operation.ops;
    for (var i = 0, l = ops.length; i < l; i++) {
      var op = ops[i];
      if (op.skip) {
        if (strIndex + op.skip > str.length) {
          throw new Error("Operation can't retain more characters than are left in the string.");
        }
        newStr[j++] = str.slice(strIndex, strIndex + op.skip);
        strIndex += op.skip;
      } else if (op.insert) {
        newStr[j++] = op.insert;
      } else { // delete op
        if (op.delete !== str.slice(strIndex, strIndex + op.delete.length)) {
          throw new Error("The deleted string and the next characters in the string don't match.");
        }
        strIndex += op.delete.length;
      }
    }
    if (strIndex !== str.length) {
      throw new Error("The operation didn't operate on the whole string.");
    }
    return newStr.join('');
  }

  function compose (operation1, operation2) {
    if (operation1.targetLength !== operation2.baseLength) {
      throw new Error("The base length of the second operation has two be the target length of the first operation");
    }
    var operation = new Operation(operation1.baseRevision);
    var ops1 = operation1.ops, ops2 = operation2.ops;
    var i1 = 0, i2 = 0;
    var op1 = ops1[i1++], op2 = ops2[i2++];
    while (true) {
      var op1l = op1.skip || (op1.insert || op1.delete).length;
      var op2l = op2.skip || (op2.insert || op2.delete).length;
      var minl = Math.min(op1l, op2l);
      if (typeof op1 === 'undefined' && typeof op2 === 'undefined') {
        break;
      } else if (typeof op1 === 'undefined') {
        if (!op2.insert) {
          throw new Error("Successive operations can only insert new characters at the end of the string.");
        }
        operation.insert(op2.insert);
        op2 = ops2[i2++];
      } else if (typeof op2 === 'undefined') {
        if (!op1.delete) {
          throw new Error("The first operation can only delete at the end of operation 2.");
        }
        operation.delete(op1.delete);
        op1 = ops1[i1++];
      } else if (op1.skip && op2.skip) {
        if (op1l > op2l) {
          operation.skip(op2l);
          op1 = { skip: op1l - op2l };
          op2 = ops2[i2++];
        } else if (op1l === op2l) {
          operation.skip(op1l);
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          operation.skip(op1l);
          op1 = ops1[i1++];
          op2 = { skip: op2l - op1l };
        }
      } else if (op1.insert && op2.delete) {
        if (op1.insert.slice(0, minl) !== op2.delete.slice(0, minl)) {
          throw new Error("Successive operations must delete what has been inserted before.");
        }
        if (op1l > op2l) {
          op1 = { insert: op1.insert.slice(op2l) };
          op2 = ops2[i2++];
        } else if (op1l === op2l) {
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          op1 = ops1[i1++];
          op2 = { delete: op2.delete.slice(op1l) };
        }
      } else if (op1.insert && op2.skip) {
        if (op1l > op2l) {
          operation.insert(op1.insert.slice(0, op2l));
          op1 = { insert: op1.insert.slice(op2l) };
          op2 = ops2[i2++];
        } else if (op1l === op2l) {
          operation.insert(op1.insert);
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          operation.insert(op1.insert);
          op1 =ops1[i1++];
          op2 = { skip: op2l - op1l };
        }
      } else if (op1.skip && op2.delete) {
        if (op1l > op2l) {
          operation.delete(op2.delete);
          op1 = { skip: op1l - op2l };
          op2 = ops2[i2++];
        } else if (op1l === op2l) {
          operation.delete(op2.delete);
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          operation.delete(op2.delete.slice(0, op1l));
          op1 = ops1[i1++];
          op2 = { delete: op2.delete.slice(op1l) };
        }
      } else if (op1.delete) {
        operation.delete(op1.delete);
        op1 = ops1[i1++];
      } else if (op2.insert) {
        operation.insert(op2.insert);
        op2 = ops2[i2++];
      } else {
        throw new Error(
          "This shouldn't happen: op1: " +
          JSON.stringify(op1) + ", op2: " +
          JSON.stringify(op2)
        );
      }
    }
    return operation;
  }

  function transform (operation1, operation2) {
    if (operation1.baseLength !== operation2.baseLength) {
      throw new Error("Both operations have to have the same base length");
    }
    if (operation1.baseRevision !== operation2.baseRevision) {
      throw new Error("Both operations have to have the same base revision");
    }
    var operation1prime = new Operation(operation2.baseRevision + 1);
    var operation2prime = new Operation(operation1.baseRevision + 1);
    var ops1 = operation1.ops, op2 = operation2.ops;
    var i1 = 0, i2 = 0;
    var op1 = ops1[i1++], op2 = ops2[i2++];
    while (true) {
      var op1l = op1.skip || (op1.insert || op1.delete).length;
      var op2l = op2.skip || (op2.insert || op2.delete).length;
      var minl = Math.min(op1l, op2l);
      if (typeof op1 === 'undefined' && typeof op2 === 'undefined') {
        break;
      } else if (op1.skip && op2.skip) {
        operation1prime.skip(minl);
        operation2prime.skip(minl);
        if (op1l > op2l) {
          op1 = { skip: op1l - op2l };
          op2 = ops2[i2++];
        } else if (op1l === op2l) {
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          op1 = ops1[i1++];
          op2 = { skip: op2l - op1l };
        }
      } else if (op1.insert) {
        operation1prime.insert(op1.insert);
        operation2prime.skip(op1.insert.length);
        op1 = ops1[i1++];
      } else if (op2.insert) {
        operation1prime.skip(op2.insert.length);
        operation2prime.insert(op2.insert);
        op2 = ops2[i2++];
      } else if (op1.delete && op2.delete) {
        if (op1.delete.slice(0, minl) !== op2.delete.slice(0, minl)) {
          throw new Error("When two concurrent operations delete text at the same position, they must delete the same text");
        }
        if (op1l > op2l) {
          op1 = { delete: op1.delete.slice(op2l) };
          op2 = ops2[i2++];
        } else if (op1l === op2l) {
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          op1 = ops1[i1++];
          op2 = { delete: op2.delete.slice(op1l) };
        }
      } else if (op1.delete && op2.skip) {
        operation1prime.delete(op1.delete.slice(minl));
        if (op1l > op2l) {
          op1 = { delete: op1.delete.slice(op2l) };
          op2 = ops2[i2++];
        } else if (op1l === op2l) {
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          op1 = ops1[i1++];
          op2 = { skip: op2.skip - op1l };
        }
      } else if (op1.skip && op2.delete) {
        operation2prime.delete(op2.delete.slice(minl));
        if (op1l > op2l) {
          op1 = { skip: op1.skip - op2l };
          op2 = ops2[i2++];
        } else if (op1l === op2l) {
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          op1 = ops1[i1++];
          op2 = { delete: op2.delete.slice(op1l) };
        }
      } else {
        throw new Error("The two operations aren't compatible");
      }
    }
    return [operation1prime, operation2prime];
  }

  function assert (b) {
    if (!b) {
      throw new Error("Assertion error");
    }
  }

  return {
    Operation: Operation,
    apply: apply,
    compose: compose,
    transform: transform
  };

})();

if (typeof module === 'object') {
  module.exports = operational_transformation;
}