import * as t from 'lib0/testing'
import * as Y from 'yjs'
import {
  absolutePositionToRelativePosition,
  isMisresolvedAfterStructuralChange,
  isMisresolvedTextPosition,
  isStructuralTransaction,
  relativePositionToAbsolutePosition,
  ySyncPluginKey
} from '../../src/y-tiptap.js'
import { createNewProsemirrorView, schema } from '../shared.js'

export const testIsMisresolvedTextPosition = (_tc) => {
  const ydoc = new Y.Doc()
  const view = createNewProsemirrorView(ydoc)

  view.dispatch(
    view.state.tr.insert(0, [
      schema.node('paragraph', undefined, schema.text('hello')),
      schema.node('paragraph', undefined, schema.text('block'))
    ])
  )

  const ystate = ySyncPluginKey.getState(view.state)
  const relAtSix = absolutePositionToRelativePosition(
    6,
    ystate.type,
    ystate.binding.mapping
  )
  t.assert(
    isMisresolvedTextPosition(ydoc, relAtSix, 6) === false,
    'valid mid-document positions should not be misresolved'
  )

  t.assert(
    isMisresolvedTextPosition(ydoc, relAtSix, null) === false,
    'null absolute positions should not be treated as misresolved'
  )

  const initialDoc = view.state.doc
  const blockNode = initialDoc.child(1)
  const blockStart = initialDoc.child(0).nodeSize
  view.dispatch(
    view.state.tr
      .delete(blockStart, blockStart + blockNode.nodeSize)
      .insert(0, blockNode)
  )

  const ystateAfter = ySyncPluginKey.getState(view.state)
  t.assert(
    relativePositionToAbsolutePosition(
      ydoc,
      ystateAfter.type,
      relAtSix,
      ystateAfter.binding.mapping
    ) === null,
    'stale relative positions should resolve to null after block reorder'
  )
}

export const testIsMisresolvedAfterStructuralChange = (_tc) => {
  const oldDoc = schema.node('doc', undefined, [
    schema.node('paragraph', undefined, schema.text('one')),
    schema.node('paragraph', undefined, schema.text('two here')),
    schema.node('paragraph', undefined, schema.text('three'))
  ])
  const newDoc = schema.node('doc', undefined, [
    schema.node('paragraph', undefined, schema.text('three')),
    schema.node('paragraph', undefined, schema.text('one')),
    schema.node('paragraph', undefined, schema.text('two here'))
  ])

  t.assert(
    isMisresolvedAfterStructuralChange(oldDoc, newDoc, 10, 8),
    'resolved positions at the start of the correct block should be treated as misresolved'
  )
  t.assert(
    isMisresolvedAfterStructuralChange(oldDoc, newDoc, 10, 17) === false,
    'correctly remapped positions should not be treated as misresolved'
  )

  const movedStartOldDoc = schema.node('doc', undefined, [
    schema.node('paragraph', undefined, schema.text('hello')),
    schema.node('paragraph', undefined, schema.text('block'))
  ])
  const movedStartNewDoc = schema.node('doc', undefined, [
    schema.node('paragraph', undefined, schema.text('block')),
    schema.node('paragraph', undefined, schema.text('hello'))
  ])

  t.assert(
    isMisresolvedAfterStructuralChange(movedStartOldDoc, movedStartNewDoc, 1, 1),
    'paragraph-start selections attached to the wrong block should be treated as misresolved'
  )

  const hrNewDoc = schema.node('doc', undefined, [
    schema.node('horizontal_rule'),
    schema.node('paragraph', undefined, schema.text('hello')),
    schema.node('paragraph', undefined, schema.text('world'))
  ])
  t.assert(
    isMisresolvedAfterStructuralChange(movedStartOldDoc, hrNewDoc, 3, 1),
    'textblock cursors resolving into a non-textblock should be treated as misresolved'
  )

  const headingOldDoc = schema.node('doc', undefined, [
    schema.node('heading', { level: 1 }, schema.text('same')),
    schema.node('heading', { level: 2 }, schema.text('same'))
  ])
  const headingNewDoc = schema.node('doc', undefined, [
    schema.node('heading', { level: 2 }, schema.text('same')),
    schema.node('heading', { level: 1 }, schema.text('same'))
  ])
  t.assert(
    isMisresolvedAfterStructuralChange(headingOldDoc, headingNewDoc, 11, 11),
    'non-zero offsets landing in a same-text block with different attrs should be treated as misresolved'
  )

  const dupOldDoc = schema.node('doc', undefined, [
    schema.node('paragraph', undefined, schema.text('same'))
  ])
  const dupNewDoc = schema.node('doc', undefined, [
    schema.node('paragraph', undefined, schema.text('same')),
    schema.node('paragraph', undefined, schema.text('same'))
  ])
  t.assert(
    isMisresolvedAfterStructuralChange(dupOldDoc, dupNewDoc, 3, 9) === false,
    'when text, attrs and offset all agree the Yjs resolution should be trusted'
  )
}
export const testIsStructuralTransaction = (_tc) => {
  const ydoc = new Y.Doc()
  const view = createNewProsemirrorView(ydoc)

  view.dispatch(
    view.state.tr.insert(0, [
      schema.node('paragraph', undefined, schema.text('hello')),
      schema.node('paragraph', undefined, schema.text('block'))
    ])
  )

  const baseDoc = view.state.doc
  const typingTr = view.state.tr.insertText('!', 2, 2)
  t.assert(
    isStructuralTransaction(typingTr, baseDoc) === false,
    'inline typing should not be treated as structural'
  )

  const blockMoveTr = view.state.tr
    .delete(baseDoc.child(0).nodeSize, baseDoc.child(0).nodeSize + baseDoc.child(1).nodeSize)
    .insert(0, baseDoc.child(1))
  t.assert(
    isStructuralTransaction(blockMoveTr, baseDoc),
    'block reorder should be treated as structural'
  )
}

/**
 * @param {t.TestCase} _tc
 */
