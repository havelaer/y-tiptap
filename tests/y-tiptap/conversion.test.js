import * as t from 'lib0/testing'
import * as Y from 'yjs'
import {
  prosemirrorJSONToYDoc,
  prosemirrorJSONToYXmlFragment,
  yDocToProsemirrorJSON,
  yXmlFragmentToProsemirrorJSON
} from '../../src/y-tiptap.js'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { createNewProsemirrorView, schema } from '../shared.js'

/**
 * @param {{ testObjects: import('prosemirror-view').EditorView[] }} result
 */
const checkResult = (result) => {
  for (let index = 1; index < result.testObjects.length; index++) {
    const previous = result.testObjects[index - 1].state.doc.toJSON()
    const current = result.testObjects[index].state.doc.toJSON()
    t.compare(previous, current)
  }
}

export const testOverlappingMarks = (_tc) => {
  const view = new EditorView(null, {
    state: EditorState.create({
      schema,
      plugins: []
    })
  })
  view.dispatch(
    view.state.tr.insert(
      0,
      schema.node('paragraph', undefined, schema.text('hello world'))
    )
  )

  view.dispatch(view.state.tr.addMark(1, 3, schema.mark('comment', { id: 4 })))
  view.dispatch(view.state.tr.addMark(2, 4, schema.mark('comment', { id: 5 })))
  const stateJSON = JSON.parse(JSON.stringify(view.state.doc.toJSON()))
  // attrs.ychange is only available with a schema
  delete stateJSON.content[0].attrs
  const back = prosemirrorJSONToYDoc(/** @type {any} */ (schema), stateJSON)
  // test if transforming back and forth from Yjs doc works
  const backandforth = JSON.parse(JSON.stringify(yDocToProsemirrorJSON(back)))
  t.compare(stateJSON, backandforth)

  // re-assure that we have overlapping comments
  const expected =
    '[{"type":"text","marks":[{"type":"comment","attrs":{"id":4}}],"text":"h"},{"type":"text","marks":[{"type":"comment","attrs":{"id":4}},{"type":"comment","attrs":{"id":5}}],"text":"e"},{"type":"text","marks":[{"type":"comment","attrs":{"id":5}}],"text":"l"},{"type":"text","text":"lo world"}]'
  t.compare(backandforth.content[0].content, JSON.parse(expected))
}

/**
 * @param {t.TestCase} tc
 */
export const testDocTransformation = (_tc) => {
  const view = createNewProsemirrorView(new Y.Doc())
  view.dispatch(
    view.state.tr.insert(
      0,
      /** @type {any} */ (
        schema.node('paragraph', undefined, schema.text('hello world'))
      )
    )
  )
  const stateJSON = view.state.doc.toJSON()
  // test if transforming back and forth from Yjs doc works
  const backandforth = yDocToProsemirrorJSON(
    prosemirrorJSONToYDoc(/** @type {any} */ (schema), stateJSON)
  )
  t.compare(stateJSON, backandforth)
}

export const testXmlFragmentTransformation = (_tc) => {
  const view = createNewProsemirrorView(new Y.Doc())
  view.dispatch(
    view.state.tr.insert(
      0,
      /** @type {any} */ (
        schema.node('paragraph', undefined, schema.text('hello world'))
      )
    )
  )
  const stateJSON = view.state.doc.toJSON()
  console.log(JSON.stringify(stateJSON))
  // test if transforming back and forth from yXmlFragment works
  const xml = new Y.XmlFragment()
  prosemirrorJSONToYXmlFragment(/** @type {any} */ (schema), stateJSON, xml)
  const doc = new Y.Doc()
  doc.getMap('root').set('firstDoc', xml)
  const backandforth = yXmlFragmentToProsemirrorJSON(xml)
  console.log(JSON.stringify(backandforth))
  t.compare(stateJSON, backandforth)
}
export const testInsertDuplication = (_tc) => {
  const ydoc1 = new Y.Doc()
  ydoc1.clientID = 1
  const ydoc2 = new Y.Doc()
  ydoc2.clientID = 2
  const view1 = createNewProsemirrorView(ydoc1)
  const view2 = createNewProsemirrorView(ydoc2)
  const yxml1 = ydoc1.getXmlFragment('prosemirror')
  const yxml2 = ydoc2.getXmlFragment('prosemirror')
  yxml1.observeDeep((events) => {
    events.forEach((event) => {
      console.log('yxml1: ', JSON.stringify(event.changes.delta))
    })
  })
  yxml2.observeDeep((events) => {
    events.forEach((event) => {
      console.log('yxml2: ', JSON.stringify(event.changes.delta))
    })
  })
  view1.dispatch(
    view1.state.tr.insert(0, /** @type {any} */ (schema.node('paragraph')))
  )
  const sync = () => {
    Y.applyUpdate(ydoc2, Y.encodeStateAsUpdate(ydoc1))
    Y.applyUpdate(ydoc1, Y.encodeStateAsUpdate(ydoc2))
    Y.applyUpdate(ydoc2, Y.encodeStateAsUpdate(ydoc1))
    Y.applyUpdate(ydoc1, Y.encodeStateAsUpdate(ydoc2))
  }
  sync()
  view1.dispatch(view1.state.tr.insertText('1', 1, 1))
  view2.dispatch(view2.state.tr.insertText('2', 1, 1))
  sync()
  view1.dispatch(view1.state.tr.insertText('1', 2, 2))
  view2.dispatch(view2.state.tr.insertText('2', 3, 3))
  sync()
  checkResult({ testObjects: [view1, view2] })
  t.assert(
    yxml1.toString() === '<paragraph>1122</paragraph><paragraph></paragraph>'
  )
}

export const testReplaceBoldWithCode = (_tc) => {
  const ydoc = new Y.Doc()
  const yXmlFragment = ydoc.get('prosemirror', Y.XmlFragment)
  const view = createNewProsemirrorView(ydoc) // This already includes ySyncPlugin

  // Insert a paragraph with some text
  view.dispatch(
    view.state.tr.insert(
      0,
      schema.node('paragraph', undefined, schema.text('test'))
    )
  )

  view.dispatch(view.state.tr.addMark(1, 5, schema.mark('strong')))

  t.compare(
    JSON.parse(JSON.stringify(view.state.doc.toJSON().content[0].content)),
    [
      {
        type: 'text',
        marks: [{ type: 'strong' }],
        text: 'test'
      }
    ],
    'invalid view state'
  )

  t.compare(
    yXmlFragment.get(0).toString(),
    '<paragraph><strong>test</strong></paragraph>',
    'invalid ydoc state'
  )

  view.dispatch(
    view.state.tr
      .removeMark(1, 5, schema.mark('strong'))
      .addMark(1, 5, schema.mark('code'))
  )

  t.compare(
    JSON.parse(JSON.stringify(view.state.doc.toJSON().content[0].content)),
    [
      {
        type: 'text',
        marks: [{ type: 'code' }],
        text: 'test'
      }
    ],
    'invalid view state'
  )

  t.compare(
    yXmlFragment.get(0).toString(),
    '<paragraph><code>test</code></paragraph>',
    'invalid ydoc state'
  )
}
