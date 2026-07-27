import * as t from 'lib0/testing'
import * as Y from 'yjs'
import * as promise from 'lib0/promise'
import { Awareness } from 'y-protocols/awareness'
import { TextSelection } from 'prosemirror-state'
import {
  absolutePositionToRelativePosition,
  yCursorPluginKey,
  ySyncPluginKey
} from '../../src/y-tiptap.js'
import {
  createViewWithCursor,
  getRemoteCursorWidgetPos,
  publishRemoteCursor,
  schema,
  syncAwareness,
  syncYDocs
} from '../shared.js'

/**
 * Remote carets must stay at the correct typing position when a block is moved
 * above the remote user's paragraph (drag-and-drop).
 *
 * @param {t.TestCase} _tc
 */
export const testRemoteCursorSurvivesStructuralChange = (_tc) => {
  const ydoc = new Y.Doc()
  ydoc.clientID = 1
  const awareness = new Awareness(ydoc)
  const view = createViewWithCursor(ydoc, awareness)

  // User A types in the first paragraph; a second block will be dragged above it.
  view.dispatch(
    view.state.tr.insert(0, [
      schema.node('paragraph', undefined, schema.text('hello')),
      schema.node('paragraph', undefined, schema.text('block'))
    ])
  )

  const initialDoc = view.state.doc
  const typingCursorPos = 1 + 'hello'.length
  t.assert(typingCursorPos === 6, 'precondition: cursor position in first paragraph')

  const ystate = ySyncPluginKey.getState(view.state)
  const yXmlFragment = ystate.type
  const remoteClientId = 2
  const anchorRel = absolutePositionToRelativePosition(
    typingCursorPos,
    yXmlFragment,
    ystate.binding.mapping
  )
  const headRel = absolutePositionToRelativePosition(
    typingCursorPos,
    yXmlFragment,
    ystate.binding.mapping
  )
  awareness.states.set(remoteClientId, {
    user: { name: 'Remote User', color: '#ff0000' },
    cursor: { anchor: anchorRel, head: headRel }
  })
  view.dispatch(view.state.tr.setMeta(yCursorPluginKey, { awarenessUpdated: true }))

  // Simulate drag-and-drop: move the second block above the first paragraph.
  const blockNode = initialDoc.child(1)
  const blockStart = initialDoc.child(0).nodeSize
  const blockSize = blockNode.nodeSize
  view.dispatch(
    view.state.tr.delete(blockStart, blockStart + blockSize).insert(0, blockNode)
  )

  const expectedCursorPos = typingCursorPos + blockSize

  // Simulate the remote user re-publishing their cursor after the structural change
  // (e.g. continued typing once the drag-and-drop update has been applied).
  const ystateAfter = ySyncPluginKey.getState(view.state)
  const refreshedAnchorRel = absolutePositionToRelativePosition(
    expectedCursorPos,
    ystateAfter.type,
    ystateAfter.binding.mapping
  )
  const refreshedHeadRel = absolutePositionToRelativePosition(
    expectedCursorPos,
    ystateAfter.type,
    ystateAfter.binding.mapping
  )
  awareness.states.set(remoteClientId, {
    user: { name: 'Remote User', color: '#ff0000' },
    cursor: { anchor: refreshedAnchorRel, head: refreshedHeadRel }
  })
  view.dispatch(view.state.tr.setMeta(yCursorPluginKey, { awarenessUpdated: true }))

  const decos = yCursorPluginKey.getState(view.state)
  const found = decos.find(0, view.state.doc.content.size)
  t.assert(found.length >= 1, 'remote cursor decorations should be present')

  const widgetDeco = found.find((d) => d.spec && d.spec.side === 10)
  const inlineDeco = found.find((d) => !d.spec || d.spec.side !== 10)

  t.assert(widgetDeco != null, 'remote cursor widget should exist')
  t.assert(
    widgetDeco.from > 1,
    'remote cursor should not jump to document start'
  )
  t.assert(
    widgetDeco.from >= expectedCursorPos - 1 &&
      widgetDeco.from <= expectedCursorPos + 1,
    `remote cursor should be near ${expectedCursorPos}, got ${widgetDeco.from}`
  )
  if (inlineDeco) {
    t.assert(
      Math.abs(inlineDeco.from - inlineDeco.to) <= 1,
      'collapsed remote selection should not appear split'
    )
    t.assert(
      Math.abs(inlineDeco.from - widgetDeco.from) <= 1,
      'remote selection highlight should match caret widget position'
    )
  }
}

/**
 * A local block move changes the ProseMirror document before it updates the
 * Yjs mapping. Remote awareness must stay hidden during that transition.
 *
 * @param {t.TestCase} _tc
 */
export const testRemoteCursorHiddenDuringLocalStructuralChange = (_tc) => {
  const ydoc = new Y.Doc()
  ydoc.clientID = 1
  const awareness = new Awareness(ydoc)
  const view = createViewWithCursor(ydoc, awareness)
  const remoteClientId = 2

  view.dispatch(
    view.state.tr.insert(0, [
      schema.node('paragraph', undefined, schema.text('hello')),
      schema.node('paragraph', undefined, schema.text('block'))
    ])
  )
  publishRemoteCursor(view, awareness, remoteClientId, 6)

  const initialDoc = view.state.doc
  const blockNode = initialDoc.child(1)
  const blockStart = initialDoc.child(0).nodeSize
  view.dispatch(
    view.state.tr
      .delete(blockStart, blockStart + blockNode.nodeSize)
      .insert(0, blockNode)
  )

  const decorations = yCursorPluginKey.getState(view.state)
  t.assert(
    decorations.find(0, view.state.doc.content.size).length === 0,
    'stale awareness should not leave a caret or selection highlight behind'
  )
}

/**
 * A remote cursor returns only after its owner restores its selection and
 * publishes a position against the changed Yjs document.
 *
 * @param {t.TestCase} _tc
 */
export const testRemoteCursorRestoredAfterStructuralChange = async (_tc) => {
  const ydocA = new Y.Doc()
  ydocA.clientID = 1
  const ydocB = new Y.Doc()
  ydocB.clientID = 2
  const awarenessA = new Awareness(ydocA)
  const awarenessB = new Awareness(ydocB)
  const viewA = createViewWithCursor(ydocA, awarenessA)
  const viewB = createViewWithCursor(ydocB, awarenessB)

  viewA.dispatch(
    viewA.state.tr.insert(0, [
      schema.node('paragraph', undefined, schema.text('hello')),
      schema.node('paragraph', undefined, schema.text('block'))
    ])
  )
  syncYDocs(ydocA, ydocB)

  const typingCursorPos = 6
  // JSDOM cannot focus an EditorView, but the cursor plugin must see A as
  // focused to publish the selection through awareness.
  viewA.hasFocus = () => true
  viewA.dispatch(
    viewA.state.tr.setSelection(TextSelection.create(viewA.state.doc, typingCursorPos))
  )
  const initialCursor = awarenessA.getLocalState().cursor
  syncAwareness(awarenessA, awarenessB, ydocA.clientID)
  await promise.wait(10)

  const initialDoc = viewB.state.doc
  const movedBlock = initialDoc.child(1)
  const blockStart = initialDoc.child(0).nodeSize
  viewB.dispatch(
    viewB.state.tr
      .delete(blockStart, blockStart + movedBlock.nodeSize)
      .insert(0, movedBlock)
  )
  t.assert(
    getRemoteCursorWidgetPos(viewB) === null,
    'stale remote cursor should be hidden while the document update is in flight'
  )

  Y.applyUpdate(ydocA, Y.encodeStateAsUpdate(ydocB))

  const expectedCursorPos = typingCursorPos + movedBlock.nodeSize
  t.assert(
    viewA.state.selection.head === expectedCursorPos,
    `local cursor should recover to ${expectedCursorPos}, got ${viewA.state.selection.head}`
  )
  const restoredCursor = awarenessA.getLocalState().cursor
  t.assert(
    !Y.compareRelativePositions(initialCursor.head, restoredCursor.head),
    'typing user should publish a new cursor position after the structural update'
  )

  syncAwareness(awarenessA, awarenessB, ydocA.clientID)
  await promise.wait(10)

  const widgetPos = getRemoteCursorWidgetPos(viewB)
  t.assert(
    widgetPos === expectedCursorPos,
    `refreshed remote cursor should render at ${expectedCursorPos}, got ${widgetPos}`
  )
}

/**
 * Stale awareness positions must not render a remote caret at the document start
 * after a structural change.
 *
 * @param {t.TestCase} _tc
 */
export const testStaleRemoteCursorHiddenAfterStructuralChange = (_tc) => {
  const ydoc = new Y.Doc()
  ydoc.clientID = 1
  const awareness = new Awareness(ydoc)
  const view = createViewWithCursor(ydoc, awareness)
  const remoteClientId = 2

  view.dispatch(
    view.state.tr.insert(0, [
      schema.node('paragraph', undefined, schema.text('hello')),
      schema.node('paragraph', undefined, schema.text('block'))
    ])
  )

  publishRemoteCursor(view, awareness, remoteClientId, 6)

  const initialDoc = view.state.doc
  const blockNode = initialDoc.child(1)
  const blockStart = initialDoc.child(0).nodeSize
  view.dispatch(
    view.state.tr
      .delete(blockStart, blockStart + blockNode.nodeSize)
      .insert(0, blockNode)
  )

  // Recompute decorations without refreshing awareness (simulates lagging cursor broadcast).
  view.dispatch(view.state.tr.setMeta(yCursorPluginKey, { awarenessUpdated: true }))

  const widgetPos = getRemoteCursorWidgetPos(view)
  t.assert(
    widgetPos === null,
    'stale remote cursor should not render after structural change without awareness refresh'
  )
}

/**
 * Remote carets near the document start must still render after unrelated remote edits.
 *
 * @param {t.TestCase} _tc
 */
export const testRemoteCursorAtDocumentStartStillRenders = (_tc) => {
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

  const cursorAtStart = 1
  publishRemoteCursor(view2, awareness2, remoteClientId, cursorAtStart)

  const editPos = view2.state.doc.content.size - 1
  view2.dispatch(view2.state.tr.insertText('!', editPos, editPos))
  Y.applyUpdate(ydoc1, Y.encodeStateAsUpdate(ydoc2))

  publishRemoteCursor(view2, awareness2, remoteClientId, cursorAtStart)

  const widgetPos = getRemoteCursorWidgetPos(view2)
  t.assert(
    widgetPos !== null && widgetPos >= cursorAtStart && widgetPos <= cursorAtStart + 1,
    `remote cursor at document start should still render near ${cursorAtStart}, got ${widgetPos}`
  )
}
