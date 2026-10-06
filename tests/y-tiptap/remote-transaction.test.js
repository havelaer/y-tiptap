import * as t from 'lib0/testing'
import * as Y from 'yjs'
import { createNewProsemirrorView, schema } from '../shared.js'

const remoteParagraphResult = (fragmentFirst, localEdit = false, insertBefore = false) => {
  const ydocA = new Y.Doc()
  ydocA.clientID = 1
  const ydocB = new Y.Doc()
  ydocB.clientID = 2
  const viewA = createNewProsemirrorView(ydocA)
  const viewB = createNewProsemirrorView(ydocB)

  viewA.dispatch(
    viewA.state.tr.replaceWith(
      0,
      viewA.state.doc.content.size,
      schema.node('paragraph', null, schema.text('old'))
    )
  )
  Y.applyUpdate(ydocB, Y.encodeStateAsUpdate(ydocA))

  // A's metadata observer dispatches during the remote update.
  ydocA.getMap('meta').observeDeep(() => {
    if (localEdit) {
      let oldEnd = 4
      viewA.state.doc.forEach((paragraph, offset) => {
        if (paragraph.textContent === 'old') oldEnd = offset + paragraph.nodeSize - 1
      })
      viewA.dispatch(viewA.state.tr.insertText('!', oldEnd))
    } else {
      viewA.dispatch(viewA.state.tr.setMeta('ui-refresh', true))
    }
  })

  const addParagraph = () =>
    viewB.dispatch(
      viewB.state.tr.insert(
        insertBefore ? 0 : viewB.state.doc.content.size,
        schema.node('paragraph', null, schema.text('new'))
      )
    )
  if (fragmentFirst) addParagraph()
  ydocB.getMap('meta').set('note', 'added')
  if (!fragmentFirst) addParagraph()

  const remoteUpdate = Y.encodeStateAsUpdate(ydocB, Y.encodeStateVector(ydocA))
  Y.applyUpdate(ydocA, remoteUpdate)
  Y.applyUpdate(ydocB, Y.encodeStateAsUpdate(ydocA, Y.encodeStateVector(ydocB)))

  const paragraphTexts = (view) => {
    const texts = []
    view.state.doc.forEach((paragraph) => texts.push(paragraph.textContent))
    return texts
  }
  return {
    paragraphsA: paragraphTexts(viewA),
    paragraphsB: paragraphTexts(viewB),
    fragmentLengthA: ydocA.getXmlFragment('prosemirror').length,
    fragmentLengthB: ydocB.getXmlFragment('prosemirror').length
  }
}

const expected = {
  paragraphsA: ['old', 'new'],
  paragraphsB: ['old', 'new'],
  fragmentLengthA: 2,
  fragmentLengthB: 2
}

export const testRemoteParagraphWhenFragmentChangesFirst = (_tc) => {
  t.compare(remoteParagraphResult(true), expected)
}

export const testRemoteParagraphSurvivesStateUpdate = (_tc) => {
  t.compare(remoteParagraphResult(false), expected)
}

const expectedWithLocalEdit = {
  paragraphsA: ['old!', 'new'],
  paragraphsB: ['old!', 'new'],
  fragmentLengthA: 2,
  fragmentLengthB: 2
}

export const testLocalEditWhenFragmentChangesFirstReachesPeer = (_tc) => {
  t.compare(remoteParagraphResult(true, true), expectedWithLocalEdit)
}

export const testLocalEditWhenMetadataChangesFirstReachesPeer = (_tc) => {
  t.compare(remoteParagraphResult(false, true), expectedWithLocalEdit)
}

export const testLocalEditFollowsRemoteParagraphInsertedBeforeIt = (_tc) => {
  t.compare(remoteParagraphResult(false, true, true), {
    paragraphsA: ['new', 'old!'],
    paragraphsB: ['new', 'old!'],
    fragmentLengthA: 2,
    fragmentLengthB: 2
  })
}

export const testLocalEditDuringMetadataUpdateReachesPeer = (_tc) => {
  const ydocA = new Y.Doc()
  ydocA.clientID = 1
  const ydocB = new Y.Doc()
  ydocB.clientID = 2
  const viewA = createNewProsemirrorView(ydocA)
  const viewB = createNewProsemirrorView(ydocB)

  viewA.dispatch(viewA.state.tr.insertText('old', 1))
  Y.applyUpdate(ydocB, Y.encodeStateAsUpdate(ydocA))

  ydocA.getMap('meta').observeDeep(() => {
    viewA.dispatch(viewA.state.tr.insertText('!', 4))
  })
  ydocB.getMap('meta').set('note', 'added')

  Y.applyUpdate(ydocA, Y.encodeStateAsUpdate(ydocB, Y.encodeStateVector(ydocA)))
  Y.applyUpdate(ydocB, Y.encodeStateAsUpdate(ydocA, Y.encodeStateVector(ydocB)))

  t.compare(viewA.state.doc.textContent, 'old!')
  t.compare(viewB.state.doc.textContent, 'old!')
  t.compare(ydocA.getXmlFragment('prosemirror').toString(), '<paragraph>old!</paragraph>')
  t.compare(ydocB.getXmlFragment('prosemirror').toString(), '<paragraph>old!</paragraph>')
}
