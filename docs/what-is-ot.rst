What is Operational Transformation?
===================================


Why Operational Transformation?
-------------------------------

The problem that `Operational Transformation (OT) <http://en.wikipedia.org/wiki/Operational_transformation>`_ solves is the following: You want to work on a document, source code or drawing together with other users over the internet and want to see the edits of other users live. Your edits should appear instantaneous without a lag caused by network latency and multiple edits happening at the same time should not lead to divergent document states. This technology is used by many popular applications including:

* `SubEthaEdit (code editor) <http://www.codingmonkeys.de/subethaedit/>`_
* `EtherPad <http://etherpad.org/>`_
* `Google Docs <https://docs.google.com/>`_
* `Mockingbird (tool for creating wireframes) <https://gomockingbird.com/>`_


How does Operational Transformation work?
-----------------------------------------

Here's the short overview:

* Every change to a shared document is represented as an operation. In a text editor, this operation could be the insertion of the character 'A' at position 12. An operation can be applied to the current document resulting in a new document state.
* To handle concurrent operations, there is a function (usually called transform) that takes two operations that have been applied to the same document state (but on different clients) and computes a new operation that can be applied after the second operation and that preserves the first operation's intended change. Let's make this clear with an example: User A inserts the character 'A' at position 12 while user B inserts 'B' at the beginning at the document. The concurrent operations are therefore ``insert(12, 'A')`` and ``insert(0, 'B')``. If we would simply send B's operation to client A and applied it there, there is no problem. But if we send A's operation to B and apply it after B's operation has been applied, the character 'A' would be inserted one character one position left from the correct position. Moreover, after these operations, A's document state and B's document state wouldn't be the same. Therefore, A's operation ``insert(12, 'A')`` has to be transformed against B's operation to take into account that B inserted a character before position 12 producing the operation ``insert(13, 'A')``. This new operation can be applied on client B after B's operation.
* This function can be used to build a client-server protocol that handles collaboration between any number of clients. This is explained in Daniel Spiewak's excellent article `Understanding and Applying Operational Transformation <http://www.codecommit.com/blog/java/understanding-and-applying-operational-transformation>`_.

However, you don't have to understand the details of Operational Transformation to use it with this library in your own project. 