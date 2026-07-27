import * as t from 'lib0/testing'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import { EditorState, Plugin } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import * as promise from 'lib0/promise'
import {
  createDecorations,
  yCursorPlugin,
  yCursorPluginKey,
  ySyncPlugin,
  yUndoPlugin
} from '../../src/y-tiptap.js'
import {
  createNewComplexProsemirrorView,
  createNewProsemirrorView,
  schema
} from '../shared.js'

export const testPluginIntegrity = (_tc) => {
  const ydoc = new Y.Doc()
  let viewUpdateEvents = 0
  let stateUpdateEvents = 0
  const customPlugin = new Plugin({
    state: {
      init: () => {
        return {}
      },
      apply: () => {
        stateUpdateEvents++
      }
    },
    view: () => {
      return {
        update () {
          viewUpdateEvents++
        }
      }
    }
  })
  const view = new EditorView(null, {
    // @ts-ignore
    state: EditorState.create({
      schema,
      plugins: [
        ySyncPlugin(ydoc.get('prosemirror', Y.XmlFragment)),
        yUndoPlugin(),
        customPlugin
      ]
    })
  })
  view.dispatch(
    view.state.tr.insert(
      0,
      /** @type {any} */ (
        schema.node('paragraph', undefined, schema.text('hello world'))
      )
    )
  )
  t.compare(
    { viewUpdateEvents, stateUpdateEvents },
    {
      viewUpdateEvents: 1,
      stateUpdateEvents: 2 // fired twice, because the ySyncPlugin adds additional fields to state after the initial render
    },
    'events are fired only once'
  )
}
/**
 * Y.UndoManager registers a `doc.on('destroy', …)` listener in its constructor
 * that UndoManager.destroy() never removes. When the doc outlives the editor
 * (e.g. several editors sharing one provider), that listener keeps the manager —
 * and everything it references — reachable, leaking memory on every destroy.
 * yUndoPlugin must remove that listener when the plugin view is destroyed.
 *
 * @param {t.TestCase} _tc
 */
export const testUndoManagerDocDestroyListenerCleanup = (_tc) => {
  const ydoc = new Y.Doc()
  const countDocDestroyListeners = () => {
    const observers = ydoc._observers.get('destroy')
    return observers ? observers.size : 0
  }
  const baseline = countDocDestroyListeners()

  const view = new EditorView(null, {
    // @ts-ignore
    state: EditorState.create({
      schema,
      plugins: [
        ySyncPlugin(ydoc.get('prosemirror', Y.XmlFragment)),
        yUndoPlugin()
      ]
    })
  })
  view.dispatch(
    view.state.tr.insert(
      0,
      /** @type {any} */ (
        schema.node('paragraph', undefined, schema.text('hello world'))
      )
    )
  )

  t.assert(
    countDocDestroyListeners() > baseline,
    'UndoManager registered a doc destroy listener'
  )

  view.destroy()

  t.assert(
    countDocDestroyListeners() === baseline,
    'doc destroy listener is removed after view.destroy'
  )
}

/**
 * A caller-provided UndoManager owns its own lifecycle, so yUndoPlugin must not
 * strip listeners it did not add.
 *
 * @param {t.TestCase} _tc
 */
export const testExternalUndoManagerListenersUntouched = (_tc) => {
  const ydoc = new Y.Doc()
  const fragment = ydoc.get('prosemirror', Y.XmlFragment)
  const externalUndoManager = new Y.UndoManager(fragment)
  const countDocDestroyListeners = () => {
    const observers = ydoc._observers.get('destroy')
    return observers ? observers.size : 0
  }
  const withExternal = countDocDestroyListeners()

  const view = new EditorView(null, {
    // @ts-ignore
    state: EditorState.create({
      schema,
      plugins: [
        ySyncPlugin(fragment),
        yUndoPlugin({ undoManager: externalUndoManager })
      ]
    })
  })
  view.dispatch(
    view.state.tr.insert(
      0,
      /** @type {any} */ (
        schema.node('paragraph', undefined, schema.text('hello world'))
      )
    )
  )
  view.destroy()

  // The external manager's listener must still be present after destroy.
  t.assert(
    countDocDestroyListeners() === withExternal,
    'externally-provided UndoManager listeners are left intact'
  )
}

/**
 * Test that createDecorations handles missing ySyncPlugin state gracefully.
 *
 * This can happen during editor initialization when the ySyncPlugin state
 * is not yet available.
 *
 * @param {t.TestCase} _tc
 */
export const testCreateDecorationsWithoutYSyncPlugin = (_tc) => {
  const ydoc = new Y.Doc()
  const awareness = new Awareness(ydoc)

  // Create an EditorState without ySyncPlugin
  const state = EditorState.create({
    schema
  })

  // This should not throw even though ySyncPluginKey.getState(state) returns undefined
  const decorations = createDecorations(
    state,
    awareness,
    () => true,
    () => document.createElement('span'),
    () => ({})
  )

  // Should return an empty DecorationSet
  t.assert(
    decorations.find().length === 0,
    'should return empty decorations when ystate is undefined'
  )
}

export const testEmptyNotSync = (_tc) => {
  const ydoc = new Y.Doc()
  const type = ydoc.getXmlFragment('prosemirror')
  const view = createNewComplexProsemirrorView(ydoc)
  t.assert(type.toString() === '', 'should only sync after first change')

  view.dispatch(
    view.state.tr.setNodeMarkup(0, undefined, {
      checked: true
    })
  )
  t.compareStrings(type.toString(), '<custom checked="true"></custom>')
}

/**
 * @param {t.TestCase} tc
 */
export const testEmptyParagraph = (_tc) => {
  const ydoc = new Y.Doc()
  const view = createNewProsemirrorView(ydoc)
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
    'contains one paragraph containing a ytext'
  )
  view.dispatch(view.state.tr.delete(1, 4)) // delete characters 123
  t.assert(
    yxml.length === 2 && yxml.get(0).length === 1,
    "doesn't delete the ytext"
  )
}

/**
 * Test duplication issue https://github.com/yjs/y-prosemirror/issues/161
 *
 * @param {t.TestCase} tc
 */

export const testInitialCursorPosition = async (_tc) => {
  const ydoc = new Y.Doc()
  const yxml = ydoc.get('prosemirror', Y.XmlFragment)
  const p = new Y.XmlElement('paragraph')
  p.insert(0, [new Y.XmlText('hello world!')])
  yxml.insert(0, [p])
  console.log('yxml', yxml.toString())
  const view = createNewProsemirrorView(ydoc)
  view.focus()
  await promise.wait(10)
  console.log('anchor', view.state.selection.anchor)
  t.assert(view.state.selection.anchor === 1)
  t.assert(view.state.selection.head === 1)
}

export const testInitialCursorPosition2 = async (_tc) => {
  const ydoc = new Y.Doc()
  const yxml = ydoc.get('prosemirror', Y.XmlFragment)
  console.log('yxml', yxml.toString())
  const view = createNewProsemirrorView(ydoc)
  view.focus()
  await promise.wait(10)
  const p = new Y.XmlElement('paragraph')
  p.insert(0, [new Y.XmlText('hello world!')])
  yxml.insert(0, [p])
  console.log('anchor', view.state.selection.anchor)
  t.assert(view.state.selection.anchor === 1)
  t.assert(view.state.selection.head === 1)
}

export const testStaleAwarenessTransactions = async (_tc) => {
  const ydoc = new Y.Doc()
  const awareness = new Awareness(ydoc)
  let insertedContent = false
  const view = new EditorView(null, {
    // @ts-ignore
    state: EditorState.create({
      schema,
      plugins: [
        ySyncPlugin(ydoc.get('prosemirror', Y.XmlFragment)),
        yCursorPlugin(awareness)
      ]
    })
  })

  const applyTransaction = tr => {
    const newState = view.state.apply(tr)
    view.updateState(newState)
  }

  view.setProps({
    dispatchTransaction: tr => {
      const cursorMeta = tr.getMeta(yCursorPluginKey)

      if (!insertedContent && cursorMeta && cursorMeta.awarenessUpdated) {
        insertedContent = true
        // Force the queued awareness transaction to become stale before apply.
        applyTransaction(view.state.tr.insertText('x', 1))
      }

      applyTransaction(tr)
    }
  })

  awareness.setLocalStateField('user', {
    name: 'Test User',
    color: '#ff0000'
  })

  await promise.wait(10)

  t.assert(view.state.doc.textContent === 'x', 'stale awareness transactions should not crash the editor')
}
