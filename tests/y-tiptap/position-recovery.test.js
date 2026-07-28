import * as t from 'lib0/testing'
import { Schema } from 'prosemirror-model'
import { findAbsolutePositionAfterStructuralChange } from '../../src/y-tiptap.js'
import { schema } from '../shared.js'

export const testFindAbsolutePositionAfterStructuralChange = (_tc) => {
  const oldDoc = schema.node('doc', undefined, [
    schema.node('paragraph', undefined, schema.text('hello')),
    schema.node('paragraph', undefined, schema.text('block'))
  ])
  const newDoc = schema.node('doc', undefined, [
    schema.node('paragraph', undefined, schema.text('block')),
    schema.node('paragraph', undefined, schema.text('hello'))
  ])

  const oldCursorPos = 6
  const expectedPos = oldCursorPos + oldDoc.child(1).nodeSize
  const remapped = findAbsolutePositionAfterStructuralChange(
    oldDoc,
    newDoc,
    oldCursorPos
  )

  t.assert(
    remapped === expectedPos,
    `cursor should remap from ${oldCursorPos} to ${expectedPos}, got ${remapped}`
  )

  const duplicateOldDoc = schema.node('doc', undefined, [
    schema.node('paragraph', undefined, schema.text('same')),
    schema.node('paragraph', undefined, schema.text('same'))
  ])
  const duplicateNewDoc = schema.node('doc', undefined, [
    schema.node('paragraph', undefined, schema.text('other')),
    schema.node('paragraph', undefined, schema.text('same')),
    schema.node('paragraph', undefined, schema.text('same'))
  ])
  const duplicateRemapped = findAbsolutePositionAfterStructuralChange(
    duplicateOldDoc,
    duplicateNewDoc,
    3
  )
  t.assert(
    duplicateRemapped === 10,
    'duplicate paragraph text should remap to the matching occurrence, got ' + duplicateRemapped
  )

  const secondDuplicateRemapped = findAbsolutePositionAfterStructuralChange(
    duplicateOldDoc,
    duplicateNewDoc,
    9
  )
  t.assert(
    secondDuplicateRemapped === 16,
    'the second duplicate paragraph should remap to the second matching block, got ' +
      secondDuplicateRemapped
  )

  const emptyOldDoc = schema.node('doc', undefined, [
    schema.node('paragraph'),
    schema.node('paragraph')
  ])
  const emptyNewDoc = schema.node('doc', undefined, [
    schema.node('paragraph', undefined, schema.text('inserted')),
    schema.node('paragraph'),
    schema.node('paragraph')
  ])
  t.assert(
    findAbsolutePositionAfterStructuralChange(emptyOldDoc, emptyNewDoc, 2) === 13,
    'the second empty paragraph should remap to the second empty block'
  )

  t.assert(
    findAbsolutePositionAfterStructuralChange(oldDoc, newDoc, 999) === null,
    'out-of-range positions should return null'
  )
}

/**
 * @param {t.TestCase} _tc
 */
export const testFindAbsolutePositionWithDivergedText = (_tc) => {
  // Local typing diverged the text (non-prefix), block identified by attrs.
  const attrsOldDoc = schema.node('doc', undefined, [
    schema.node('paragraph', undefined, schema.text('intro')),
    schema.node('heading', { level: 2 }, schema.text('helXlo wor'))
  ])
  const attrsNewDoc = schema.node('doc', undefined, [
    schema.node('heading', { level: 2 }, schema.text('hello wor')),
    schema.node('paragraph', undefined, schema.text('intro'))
  ])
  t.assert(
    findAbsolutePositionAfterStructuralChange(attrsOldDoc, attrsNewDoc, 12) === 5,
    'blocks with distinctive attrs should remap even when text diverged'
  )

  // Ambiguous attrs and non-prefix diverged text leave no reliable signal.
  const ambiguousOldDoc = schema.node('doc', undefined, [
    schema.node('heading', { level: 2 }, schema.text('aXa')),
    schema.node('heading', { level: 2 }, schema.text('bbb'))
  ])
  const ambiguousNewDoc = schema.node('doc', undefined, [
    schema.node('heading', { level: 2 }, schema.text('aa')),
    schema.node('heading', { level: 2 }, schema.text('bbb'))
  ])
  t.assert(
    findAbsolutePositionAfterStructuralChange(ambiguousOldDoc, ambiguousNewDoc, 3) === null,
    'ambiguous attrs with diverged text should not guess a block'
  )

  // A remote attr-only edit must not shadow the text match (pass order).
  const levelOldDoc = schema.node('doc', undefined, [
    schema.node('heading', { level: 2 }, schema.text('alpha')),
    schema.node('heading', { level: 2 }, schema.text('beta'))
  ])
  const levelNewDoc = schema.node('doc', undefined, [
    schema.node('heading', { level: 3 }, schema.text('alpha')),
    schema.node('heading', { level: 2 }, schema.text('beta'))
  ])
  t.assert(
    findAbsolutePositionAfterStructuralChange(levelOldDoc, levelNewDoc, 4) === 4,
    'text matching should win over attrs when a remote edit changed only attrs'
  )

  // Trailing in-flight keystrokes: new text is a prefix of the old text.
  const prefixOldDoc = schema.node('doc', undefined, [
    schema.node('paragraph', undefined, schema.text('typing her')),
    schema.node('paragraph', undefined, schema.text('other'))
  ])
  const prefixNewDoc = schema.node('doc', undefined, [
    schema.node('paragraph', undefined, schema.text('other')),
    schema.node('paragraph', undefined, schema.text('typing he'))
  ])
  t.assert(
    findAbsolutePositionAfterStructuralChange(prefixOldDoc, prefixNewDoc, 11) === 17,
    'a unique prefix match should recover the block during in-flight typing'
  )

  // Empty text is a prefix of everything and must never match by prefix.
  const emptyPrefixOldDoc = schema.node('doc', undefined, [
    schema.node('paragraph'),
    schema.node('paragraph', undefined, schema.text('x'))
  ])
  const emptyPrefixNewDoc = schema.node('doc', undefined, [
    schema.node('paragraph', undefined, schema.text('x')),
    schema.node('paragraph', undefined, schema.text('y'))
  ])
  t.assert(
    findAbsolutePositionAfterStructuralChange(emptyPrefixOldDoc, emptyPrefixNewDoc, 1) === null,
    'empty-text blocks should never match by prefix'
  )
}

const nestedSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    pullquote: {
      attrs: { uri: { default: null } },
      content: 'paragraph+',
      group: 'block'
    },
    paragraph: { content: 'inline*', group: 'block' },
    text: { group: 'inline' }
  }
})

/**
 * @param {t.TestCase} _tc
 */
export const testFindAbsolutePositionInNestedBlocks = (_tc) => {
  const oldDoc = nestedSchema.node('doc', undefined, [
    nestedSchema.node('pullquote', { uri: 'x' }, [
      nestedSchema.node('paragraph', undefined, nestedSchema.text('hello wor')),
      nestedSchema.node('paragraph', undefined, nestedSchema.text('by me'))
    ]),
    nestedSchema.node('paragraph', undefined, nestedSchema.text('outro'))
  ])
  const newDoc = nestedSchema.node('doc', undefined, [
    nestedSchema.node('paragraph', undefined, nestedSchema.text('outro')),
    nestedSchema.node('pullquote', { uri: 'x' }, [
      nestedSchema.node('paragraph', undefined, nestedSchema.text('hello wo')),
      nestedSchema.node('paragraph', undefined, nestedSchema.text('by me'))
    ])
  ])

  // Cursor at the end of the first inner paragraph (abs 11, offset 9). The
  // raw-offset remap used to land at abs 18, between the inner paragraphs;
  // the path walk must clamp into the first inner paragraph instead.
  t.assert(
    findAbsolutePositionAfterStructuralChange(oldDoc, newDoc, 11) === 17,
    'nested cursors should clamp into the same inner textblock'
  )

  const restructuredNewDoc = nestedSchema.node('doc', undefined, [
    nestedSchema.node('paragraph', undefined, nestedSchema.text('outro')),
    nestedSchema.node('pullquote', { uri: 'x' }, [
      nestedSchema.node('paragraph', undefined, nestedSchema.text('hello worby me'))
    ])
  ])
  // Cursor in the second inner paragraph; the matched block no longer has one.
  t.assert(
    findAbsolutePositionAfterStructuralChange(oldDoc, restructuredNewDoc, 14) === null,
    'a changed inner structure should bail out instead of guessing'
  )

  const typeChangedOldDoc = schema.node('doc', undefined, [
    schema.node('blockquote', undefined, schema.node('paragraph', undefined, schema.text('same')))
  ])
  const typeChangedNewDoc = schema.node('doc', undefined, [
    schema.node('blockquote', undefined, schema.node('heading', { level: 1 }, schema.text('same')))
  ])
  t.assert(
    findAbsolutePositionAfterStructuralChange(typeChangedOldDoc, typeChangedNewDoc, 3) === null,
    'a changed nested node type should bail out instead of guessing'
  )
}
