import * as t from 'lib0/testing'
import * as Y from 'yjs'
import { TextSelection } from 'prosemirror-state'
import { Awareness } from 'y-protocols/awareness'
import {
  createNewProsemirrorView,
  createViewWithCursor,
  getRemoteCursorWidgetPos,
  publishRemoteCursor,
  schema,
  syncYDocs
} from '../shared.js'

/**
 * Text typed while another client moves the first paragraph to the end and back
 * must remain in the paragraph that originally contained P2. The test uses no
 * node attributes as identity; the distinct initial text is only an assertion
 * aid for the test.
 *
 * @param {t.TestCase} _tc
 */
export const testTT836TypingStaysInParagraphDuringConsecutiveReorders = (_tc) => {
  const ydocA = new Y.Doc()
  ydocA.clientID = 1
  const ydocB = new Y.Doc()
  ydocB.clientID = 2
  const viewA = createNewProsemirrorView(ydocA)
  const viewB = createNewProsemirrorView(ydocB)

  const findParagraph = (doc, initialText) => {
    let offset = 0
    for (let index = 0; index < doc.childCount; index++) {
      const node = doc.child(index)
      if (node.textContent.startsWith(initialText)) {
        return { node, offset }
      }
      offset += node.nodeSize
    }
    throw new Error(`paragraph starting with ${initialText} not found`)
  }
  const appendToParagraph = (view, initialText, text) => {
    const { node, offset } = findParagraph(view.state.doc, initialText)
    const pos = offset + node.nodeSize - 1
    view.dispatch(view.state.tr.insertText(text, pos, pos))
  }
  const paragraphText = (doc, initialText) =>
    findParagraph(doc, initialText).node.textContent

  viewA.dispatch(
    viewA.state.tr.insert(0, [
      schema.node('paragraph', undefined, schema.text('P1')),
      schema.node('paragraph', undefined, schema.text('P2')),
      schema.node('paragraph', undefined, schema.text('P3'))
    ])
  )
  syncYDocs(ydocA, ydocB)

  const p2Start = findParagraph(viewA.state.doc, 'P2').offset + 1
  viewA.dispatch(
    viewA.state.tr.setSelection(TextSelection.create(viewA.state.doc, p2Start))
  )
  appendToParagraph(viewA, 'P2', '-a1')

  const firstMove = viewB.state.doc.child(0)
  let firstMoveTransaction = viewB.state.tr.delete(0, firstMove.nodeSize)
  firstMoveTransaction = firstMoveTransaction.insert(
    firstMoveTransaction.doc.content.size,
    firstMove
  )
  viewB.dispatch(firstMoveTransaction)

  appendToParagraph(viewA, 'P2', '-a2')
  Y.applyUpdate(ydocA, Y.encodeStateAsUpdate(ydocB))
  appendToParagraph(viewA, 'P2', '-a3')

  const p1AfterFirstMove = findParagraph(viewB.state.doc, 'P1')
  const p1Start = p1AfterFirstMove.offset
  let secondMoveTransaction = viewB.state.tr.delete(
    p1Start,
    p1Start + p1AfterFirstMove.node.nodeSize
  )
  secondMoveTransaction = secondMoveTransaction.insert(0, p1AfterFirstMove.node)
  viewB.dispatch(secondMoveTransaction)

  appendToParagraph(viewA, 'P2', '-a4')
  Y.applyUpdate(ydocA, Y.encodeStateAsUpdate(ydocB))
  t.assert(
    paragraphText(viewA.state.doc, 'P2') === 'P2-a1-a2-a3-a4',
    'P2 content should remain intact after the second remote reorder'
  )
  t.assert(
    viewA.state.doc.resolve(viewA.state.selection.head).parent.textContent.startsWith('P2'),
    'local selection should remain in P2 after the second remote reorder'
  )
  syncYDocs(ydocA, ydocB)

  const expectedP2Text = 'P2-a1-a2-a3-a4'
  for (const view of [viewA, viewB]) {
    t.assert(
      paragraphText(view.state.doc, 'P2') === expectedP2Text,
      'all in-flight text should remain in P2'
    )
    t.assert(
      paragraphText(view.state.doc, 'P1') === 'P1',
      'P1 should not receive P2 text'
    )
    t.assert(
      paragraphText(view.state.doc, 'P3') === 'P3',
      'P3 should not receive P2 text'
    )
  }

  const persistedDoc = new Y.Doc()
  Y.applyUpdate(persistedDoc, Y.encodeStateAsUpdate(ydocA))
  const persistedView = createNewProsemirrorView(persistedDoc)
  t.assert(
    paragraphText(persistedView.state.doc, 'P2') === expectedP2Text,
    'persisted content should retain all P2 text'
  )

  const selectedParagraphText = viewA.state.doc.resolve(viewA.state.selection.head).parent.textContent
  t.assert(
    selectedParagraphText === expectedP2Text,
    `local selection should remain in P2, got ${selectedParagraphText}`
  )

  const awareness = new Awareness(ydocB)
  const cursorView = createViewWithCursor(ydocB, awareness)
  const p2 = findParagraph(cursorView.state.doc, 'P2')
  const p2End = p2.offset + p2.node.nodeSize - 1
  publishRemoteCursor(cursorView, awareness, 3, p2End)
  const cursorPos = getRemoteCursorWidgetPos(cursorView)
  t.assert(cursorPos === p2End, 'remote caret should render at the P2 typing position')
  t.assert(
    cursorView.state.doc.resolve(/** @type {number} */ (cursorPos)).parent.textContent === expectedP2Text,
    'rendered remote caret should belong to P2'
  )
}
