import * as t from 'lib0/testing'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import { TextSelection } from 'prosemirror-state'
import {
  createViewWithCursor,
  getRemoteCursorWidgetPos,
  NodeRangeSelection,
  publishRemoteCursor,
  schema,
  syncYDocs
} from '../shared.js'

/**
 * Remote carets must track a typing peer across local insertions.
 *
 * @param {t.TestCase} _tc
 */
export const testRemoteCursorDuringLocalTyping = (_tc) => {
  const ydoc1 = new Y.Doc()
  ydoc1.clientID = 1
  const ydoc2 = new Y.Doc()
  ydoc2.clientID = 2
  const awareness1 = new Awareness(ydoc1)
  const awareness2 = new Awareness(ydoc2)
  const view1 = createViewWithCursor(ydoc1, awareness1)
  const view2 = createViewWithCursor(ydoc2, awareness2)
  const remoteClientId = 1

  view1.dispatch(
    view1.state.tr.insert(0, [
      schema.node('paragraph', undefined, schema.text('hello')),
      schema.node('paragraph', undefined, schema.text('block'))
    ])
  )
  syncYDocs(ydoc1, ydoc2)

  let cursorPos = 6
  view1.dispatch(
    view1.state.tr.setSelection(TextSelection.create(view1.state.doc, cursorPos))
  )
  publishRemoteCursor(view2, awareness2, remoteClientId, cursorPos)

  view1.dispatch(view1.state.tr.insertText('!', cursorPos, cursorPos))
  cursorPos += 1
  Y.applyUpdate(ydoc2, Y.encodeStateAsUpdate(ydoc1))
  publishRemoteCursor(view2, awareness2, remoteClientId, cursorPos)

  const widgetPos = getRemoteCursorWidgetPos(view2)
  t.assert(
    widgetPos !== null &&
      widgetPos >= cursorPos - 1 &&
      widgetPos <= cursorPos + 1,
    `remote cursor should follow typing peer at ~${cursorPos}, got ${widgetPos}`
  )
}

/**
 * Remote carets must shift through local inline edits via decoration mapping.
 *
 * @param {t.TestCase} _tc
 */
export const testRemoteCursorMapsThroughLocalTextEdit = (_tc) => {
  const ydoc1 = new Y.Doc()
  ydoc1.clientID = 1
  const ydoc2 = new Y.Doc()
  ydoc2.clientID = 2
  const awareness1 = new Awareness(ydoc1)
  const awareness2 = new Awareness(ydoc2)
  const view1 = createViewWithCursor(ydoc1, awareness1)
  const view2 = createViewWithCursor(ydoc2, awareness2)
  const remoteClientId = 1

  view1.dispatch(
    view1.state.tr.insert(0, [
      schema.node('paragraph', undefined, schema.text('hello')),
      schema.node('paragraph', undefined, schema.text('block'))
    ])
  )
  syncYDocs(ydoc1, ydoc2)

  const remoteCursorPos = 6
  publishRemoteCursor(view2, awareness2, remoteClientId, remoteCursorPos)

  const insertPos = 1
  view2.dispatch(view2.state.tr.insertText('x', insertPos, insertPos))

  const expectedPos = remoteCursorPos + 1
  const widgetPos = getRemoteCursorWidgetPos(view2)
  t.assert(
    widgetPos !== null &&
      widgetPos >= expectedPos - 1 &&
      widgetPos <= expectedPos + 1,
    `remote cursor should map through local typing to ~${expectedPos}, got ${widgetPos}`
  )
}

/**
 * NodeRangeSelection must survive remote updates when yCursorPlugin is active.
 *
 * @param {t.TestCase} _tc
 */
export const testNodeRangeSelectionWithCursorPluginDuringRemoteEdit = (_tc) => {
  const ydoc1 = new Y.Doc()
  ydoc1.clientID = 1
  const ydoc2 = new Y.Doc()
  ydoc2.clientID = 2
  const awareness1 = new Awareness(ydoc1)
  const awareness2 = new Awareness(ydoc2)
  const view1 = createViewWithCursor(ydoc1, awareness1)
  const view2 = createViewWithCursor(ydoc2, awareness2)

  view1.dispatch(
    view1.state.tr.insert(0, [
      schema.node('paragraph', undefined, schema.text('one')),
      schema.node('paragraph', undefined, schema.text('two')),
      schema.node('paragraph', undefined, schema.text('three'))
    ])
  )
  syncYDocs(ydoc1, ydoc2)

  const doc1 = view1.state.doc
  const head = doc1.child(0).nodeSize + doc1.child(1).nodeSize
  view1.dispatch(
    view1.state.tr.setSelection(
      new NodeRangeSelection(doc1.resolve(0), doc1.resolve(head), 0)
    )
  )
  t.assert(
    view1.state.selection instanceof NodeRangeSelection,
    'precondition: peer 1 holds a NodeRangeSelection'
  )

  const editPos = view2.state.doc.content.size - 1
  view2.dispatch(view2.state.tr.insertText('!', editPos, editPos))
  Y.applyUpdate(ydoc1, Y.encodeStateAsUpdate(ydoc2))

  const sel = view1.state.selection
  t.assert(
    sel instanceof NodeRangeSelection,
    'NodeRangeSelection should be preserved with yCursorPlugin enabled'
  )
  t.assert(
    /** @type {any} */ (sel).depth === 0,
    'the selection depth should be preserved with yCursorPlugin enabled'
  )
}
