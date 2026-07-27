import * as t from 'lib0/testing'
import * as Y from 'yjs'
import * as promise from 'lib0/promise'
import { redo, undo, ySyncPluginKey } from '../../src/y-tiptap.js'
import {
  createNewComplexProsemirrorView,
  createNewProsemirrorView,
  createNewProsemirrorViewWithUndoManager,
  schema
} from '../shared.js'

export const testChangeOrigin = (_tc) => {
  const ydoc = new Y.Doc()
  const yXmlFragment = ydoc.get('prosemirror', Y.XmlFragment)
  const yundoManager = new Y.UndoManager(yXmlFragment, {
    trackedOrigins: new Set(['trackme'])
  })
  const view = createNewProsemirrorView(ydoc)
  view.dispatch(
    view.state.tr.insert(
      0,
      /** @type {any} */ (
        schema.node('paragraph', undefined, schema.text('world'))
      )
    )
  )
  const ysyncState1 = ySyncPluginKey.getState(view.state)
  t.assert(ysyncState1.isChangeOrigin === false)
  t.assert(ysyncState1.isUndoRedoOperation === false)
  ydoc.transact(() => {
    yXmlFragment.get(0).get(0).insert(0, 'hello')
  }, 'trackme')
  const ysyncState2 = ySyncPluginKey.getState(view.state)
  t.assert(ysyncState2.isChangeOrigin === true)
  t.assert(ysyncState2.isUndoRedoOperation === false)
  yundoManager.undo()
  const ysyncState3 = ySyncPluginKey.getState(view.state)
  t.assert(ysyncState3.isChangeOrigin === true)
  t.assert(ysyncState3.isUndoRedoOperation === true)
}
/**
 * @param {t.TestCase} tc
 */

export const testAddToHistory = (_tc) => {
  const ydoc = new Y.Doc()
  const view = createNewProsemirrorViewWithUndoManager(ydoc)
  view.dispatch(
    view.state.tr.insert(
      0,
      /** @type {any} */ (
        schema.node('paragraph', undefined, schema.text('123'))
      )
    )
  )
  const yxml = ydoc.get('prosemirror')
  t.assert(
    yxml.length === 2 && yxml.get(0).length === 1,
    'contains inserted content'
  )
  undo(view.state)
  t.assert(yxml.length === 0, 'insertion was undone')
  redo(view.state)
  t.assert(
    yxml.length === 2 && yxml.get(0).length === 1,
    'contains inserted content'
  )
  undo(view.state)
  t.assert(yxml.length === 0, 'insertion was undone')
  // now insert content again, but with `'addToHistory': false`
  view.dispatch(
    view.state.tr
      .insert(
        0,
        /** @type {any} */ (
          schema.node('paragraph', undefined, schema.text('123'))
        )
      )
      .setMeta('addToHistory', false)
  )
  t.assert(
    yxml.length === 2 && yxml.get(0).length === 1,
    'contains inserted content'
  )
  undo(view.state)
  t.assert(
    yxml.length === 2 && yxml.get(0).length === 1,
    'insertion was *not* undone'
  )
}

/**
 * Tests for #126 - initial cursor position should be retained, not jump to the end.
 *
 * @param {t.TestCase} _tc
 */

export const testVersioning = async (_tc) => {
  const ydoc = new Y.Doc({ gc: false })
  const yxml = ydoc.get('prosemirror', Y.XmlFragment)
  const permanentUserData = new Y.PermanentUserData(ydoc)
  permanentUserData.setUserMapping(ydoc, ydoc.clientID, 'me')
  ydoc.gc = false
  console.log('yxml', yxml.toString())
  const view = createNewComplexProsemirrorView(ydoc)
  const p = new Y.XmlElement('paragraph')
  const ytext = new Y.XmlText('hello world!')
  p.insert(0, [ytext])
  yxml.insert(0, [p])
  const snapshot1 = Y.snapshot(ydoc)
  const snapshotDoc1 = Y.encodeStateAsUpdateV2(ydoc)
  ytext.delete(0, 6)
  const snapshot2 = Y.snapshot(ydoc)
  const snapshotDoc2 = Y.encodeStateAsUpdateV2(ydoc)
  view.dispatch(
    view.state.tr.setMeta(ySyncPluginKey, {
      snapshot: snapshot2,
      prevSnapshot: snapshot1,
      permanentUserData
    })
  )
  await promise.wait(50)
  console.log('calculated diff via snapshots: ', view.state.doc.toJSON())
  // recreate the JSON, because ProseMirror messes with the constructors
  const viewstate1 = JSON.parse(
    JSON.stringify(view.state.doc.toJSON().content[0].content)
  )
  const expectedState = [
    {
      type: 'text',
      marks: [{ type: 'ychange', attrs: { user: 'me', type: 'removed' } }],
      text: 'hello '
    },
    {
      type: 'text',
      text: 'world!'
    }
  ]
  console.log('calculated diff via snapshots: ', JSON.stringify(viewstate1))
  t.compare(viewstate1, expectedState)

  t.info('now check whether we get the same result when rendering the updates')
  view.dispatch(
    view.state.tr.setMeta(ySyncPluginKey, {
      snapshot: snapshotDoc2,
      prevSnapshot: snapshotDoc1,
      permanentUserData
    })
  )
  await promise.wait(50)

  const viewstate2 = JSON.parse(
    JSON.stringify(view.state.doc.toJSON().content[0].content)
  )
  console.log('calculated diff via updates: ', JSON.stringify(viewstate2))
  t.compare(viewstate2, expectedState)
}

export const testVersioningWithGarbageCollection = async (_tc) => {
  const ydoc = new Y.Doc()
  const yxml = ydoc.get('prosemirror', Y.XmlFragment)
  const permanentUserData = new Y.PermanentUserData(ydoc)
  permanentUserData.setUserMapping(ydoc, ydoc.clientID, 'me')
  console.log('yxml', yxml.toString())
  const view = createNewComplexProsemirrorView(ydoc)
  const p = new Y.XmlElement('paragraph')
  const ytext = new Y.XmlText('hello world!')
  p.insert(0, [ytext])
  yxml.insert(0, [p])
  const snapshotDoc1 = Y.encodeStateAsUpdateV2(ydoc)
  ytext.delete(0, 6)
  const snapshotDoc2 = Y.encodeStateAsUpdateV2(ydoc)
  view.dispatch(
    view.state.tr.setMeta(ySyncPluginKey, {
      snapshot: snapshotDoc2,
      prevSnapshot: snapshotDoc1,
      permanentUserData
    })
  )
  await promise.wait(50)
  console.log('calculated diff via snapshots: ', view.state.doc.toJSON())
  // recreate the JSON, because ProseMirror messes with the constructors
  const viewstate1 = JSON.parse(
    JSON.stringify(view.state.doc.toJSON().content[0].content)
  )
  const expectedState = [
    {
      type: 'text',
      marks: [{ type: 'ychange', attrs: { user: 'me', type: 'removed' } }],
      text: 'hello '
    },
    {
      type: 'text',
      text: 'world!'
    }
  ]
  console.log('calculated diff via snapshots: ', JSON.stringify(viewstate1))
  t.compare(viewstate1, expectedState)
}

export const testAddToHistoryIgnore = (_tc) => {
  const ydoc = new Y.Doc()
  const view = createNewProsemirrorViewWithUndoManager(ydoc)
  // perform two changes that are tracked by um - supposed to be merged into a single undo-manager item
  view.dispatch(
    view.state.tr.insert(
      0,
      /** @type {any} */ (
        schema.node('paragraph', undefined, schema.text('123'))
      )
    )
  )
  view.dispatch(
    view.state.tr.insert(
      0,
      /** @type {any} */ (
        schema.node('paragraph', undefined, schema.text('456'))
      )
    )
  )
  const yxml = ydoc.get('prosemirror')
  t.assert(
    yxml.length === 3 && yxml.get(0).length === 1,
    'contains inserted content (1)'
  )
  view.dispatch(
    view.state.tr
      .insert(
        0,
        /** @type {any} */ (
          schema.node('paragraph', undefined, schema.text('abc'))
        )
      )
      .setMeta('addToHistory', false)
  )
  t.assert(
    yxml.length === 4 && yxml.get(0).length === 1,
    'contains inserted content (2)'
  )
  view.dispatch(
    view.state.tr.insert(
      0,
      /** @type {any} */ (
        schema.node('paragraph', undefined, schema.text('xyz'))
      )
    )
  )
  t.assert(
    yxml.length === 5 && yxml.get(0).length === 1,
    'contains inserted content (3)'
  )
  undo(view.state)
  t.assert(yxml.length === 4, 'insertion (3) was undone')
  undo(view.state)
  console.log(yxml.toString())
  t.assert(
    yxml.length === 1 &&
      yxml.get(0).toString() === '<paragraph>abc</paragraph>',
    'insertion (1) was undone'
  )
}
