import * as t from 'lib0/testing'
import * as Y from 'yjs'
import { NodeSelection, TextSelection } from 'prosemirror-state'
import { Schema } from 'prosemirror-model'
import * as basicSchema from 'prosemirror-schema-basic'
import { schema as complexSchema } from '../complexSchema.js'
import {
  createNewComplexProsemirrorView,
  createNewProsemirrorView,
  createNewProsemirrorViewWithSchema,
  NodeRangeSelection,
  schema
} from '../shared.js'

export const testRestoreSelectionForDeletedInlineNode = (_tc) => {
  const ydoc = new Y.Doc()
  const schemaWithInlineAtom = new Schema({
    nodes: Object.assign({}, basicSchema.nodes, {
      inlineatom: {
        inline: true,
        group: 'inline',
        atom: true,
        selectable: true,
        parseDOM: [{ tag: 'inline-atom' }],
        toDOM () {
          return ['inline-atom']
        }
      }
    }),
    marks: basicSchema.marks
  })

  const view = createNewProsemirrorViewWithSchema(ydoc, schemaWithInlineAtom)

  view.dispatch(
    view.state.tr.insert(
      0,
      schemaWithInlineAtom.node('paragraph', undefined, [
        schemaWithInlineAtom.text('a'),
        schemaWithInlineAtom.node('inlineatom'),
        schemaWithInlineAtom.text('b')
      ])
    )
  )

  // compute the absolute position of the inline atom node inside the doc
  const para = view.state.doc.child(0)
  let pos = 1
  for (let i = 0; i < para.childCount; i++) {
    const child = para.child(i)
    if (child.type.name === 'inlineatom') break
    pos += child.nodeSize
  }

  view.dispatch(
    view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos))
  )

  const node = view.state.doc.nodeAt(pos)
  const nodeSize = node ? node.nodeSize : 1
  view.dispatch(view.state.tr.delete(pos, pos + nodeSize))

  const sel = view.state.selection
  t.assert(
    !(sel instanceof NodeSelection),
    'selection should not be a NodeSelection'
  )
  t.assert(sel instanceof TextSelection, 'selection should be a TextSelection')
  t.assert(
    sel.anchor >= 0 && sel.anchor <= view.state.doc.content.size,
    'selection anchor within bounds'
  )
}

export const testRestoreSelectionForDeletedBlockNode = async (_tc) => {
  const ydoc = new Y.Doc()
  const view = createNewComplexProsemirrorView(ydoc)

  view.dispatch(
    view.state.tr.insert(0, [
      complexSchema.node('paragraph', undefined, complexSchema.text('before')),
      complexSchema.node('custom'),
      complexSchema.node('paragraph', undefined, complexSchema.text('after'))
    ])
  )

  // compute the absolute position of the custom block node inside the doc
  const doc = view.state.doc
  let pos = 1
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i)
    if (child.type.name === 'custom') break
    pos += child.nodeSize
  }

  view.dispatch(
    view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos))
  )

  const node = view.state.doc.nodeAt(pos)
  const nodeSize = node ? node.nodeSize : 1
  view.dispatch(view.state.tr.delete(pos, pos + nodeSize))

  const sel = view.state.selection
  t.assert(
    sel instanceof NodeSelection,
    'selection should be a NodeSelection for block node'
  )
}

/**
 * A NodeRangeSelection (e.g. an active drag-handle drag) must survive a remote Yjs
 * update instead of being downgraded to a TextSelection. Regression test for TT-608,
 * where the downgrade caused collaborative drags to duplicate the dragged block.
 *
 * @param {t.TestCase} _tc
 */
export const testRestoreNodeRangeSelectionOnRemoteUpdate = (_tc) => {
  const ydoc1 = new Y.Doc()
  ydoc1.clientID = 1
  const ydoc2 = new Y.Doc()
  ydoc2.clientID = 2
  const view1 = createNewProsemirrorView(ydoc1)
  const view2 = createNewProsemirrorView(ydoc2)

  // three top-level paragraphs, authored on peer 1
  view1.dispatch(
    view1.state.tr.insert(0, [
      schema.node('paragraph', undefined, schema.text('one')),
      schema.node('paragraph', undefined, schema.text('two')),
      schema.node('paragraph', undefined, schema.text('three'))
    ])
  )
  // sync both peers to the same content
  Y.applyUpdate(ydoc2, Y.encodeStateAsUpdate(ydoc1))
  Y.applyUpdate(ydoc1, Y.encodeStateAsUpdate(ydoc2))

  // peer 1 selects a range of block nodes (paragraphs 1 + 2) at depth 0
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

  // peer 2 makes an inline edit in the last paragraph (a concurrent remote change)
  const editPos = view2.state.doc.content.size - 1
  view2.dispatch(view2.state.tr.insertText('!', editPos, editPos))

  // deliver peer 2's change to peer 1 -> triggers restoreRelativeSelection on peer 1
  Y.applyUpdate(ydoc1, Y.encodeStateAsUpdate(ydoc2))

  const sel = view1.state.selection
  t.assert(
    sel instanceof NodeRangeSelection,
    'NodeRangeSelection should be preserved across a remote update, not downgraded'
  )
  t.assert(
    /** @type {any} */ (sel).depth === 0,
    'the selection depth should be preserved'
  )
}
