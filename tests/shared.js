import * as Y from 'yjs'
import {
  absolutePositionToRelativePosition,
  yCursorPlugin,
  yCursorPluginKey,
  ySyncPlugin,
  ySyncPluginKey,
  yUndoPlugin
} from '../src/y-tiptap.js'
import {
  applyAwarenessUpdate,
  encodeAwarenessUpdate
} from 'y-protocols/awareness'
import { EditorState, Selection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { Schema } from 'prosemirror-model'
import * as basicSchema from 'prosemirror-schema-basic'
import { schema as complexSchema } from './complexSchema.js'

export const schema = new Schema({
  nodes: basicSchema.nodes,
  marks: Object.assign({}, basicSchema.marks, {
    comment: {
      attrs: {
        id: { default: null }
      },
      excludes: '',
      parseDOM: [{ tag: 'comment' }],
      toDOM (node) {
        return ['comment', { comment_id: node.attrs.id }]
      }
    }
  })
})

/**
 * Minimal stand-in for the NodeRangeSelection registered by
 * @tiptap/extension-node-range.
 */
export class NodeRangeSelection extends Selection {
  /**
   * @param {import('prosemirror-model').ResolvedPos} $anchor
   * @param {import('prosemirror-model').ResolvedPos} $head
   * @param {number} depth
   */
  constructor ($anchor, $head, depth) {
    super($anchor, $head)
    this.depth = depth
  }

  map (doc, mapping) {
    return new NodeRangeSelection(
      doc.resolve(mapping.map(this.anchor)),
      doc.resolve(mapping.map(this.head)),
      this.depth
    )
  }

  eq (other) {
    return other instanceof NodeRangeSelection &&
      other.anchor === this.anchor &&
      other.head === this.head &&
      other.depth === this.depth
  }

  toJSON () {
    return { type: 'nodeRange', anchor: this.anchor, head: this.head, depth: this.depth }
  }

  static fromJSON (doc, json) {
    return new NodeRangeSelection(doc.resolve(json.anchor), doc.resolve(json.head), json.depth)
  }
}
Selection.jsonID('nodeRange', NodeRangeSelection)

export const createNewProsemirrorViewWithSchema = (y, viewSchema, undoManager = false) => {
  return new EditorView(null, {
    // @ts-ignore
    state: EditorState.create({
      schema: viewSchema,
      plugins: [ySyncPlugin(y.get('prosemirror', Y.XmlFragment))].concat(
        undoManager ? [yUndoPlugin()] : []
      )
    })
  })
}

export const createNewProsemirrorView = (y) =>
  createNewProsemirrorViewWithSchema(y, schema)

export const createNewProsemirrorViewWithUndoManager = (y) =>
  createNewProsemirrorViewWithSchema(y, schema, true)

export const createNewComplexProsemirrorView = (y, undoManager = false) =>
  createNewProsemirrorViewWithSchema(y, complexSchema, undoManager)

export const createViewWithCursor = (ydoc, awareness) => {
  return new EditorView(null, {
    // @ts-ignore
    state: EditorState.create({
      schema,
      plugins: [
        ySyncPlugin(ydoc.get('prosemirror', Y.XmlFragment)),
        yCursorPlugin(awareness)
      ]
    })
  })
}

/**
 * @param {Y.Doc} ydocA
 * @param {Y.Doc} ydocB
 */
export const syncYDocs = (ydocA, ydocB) => {
  Y.applyUpdate(ydocB, Y.encodeStateAsUpdate(ydocA))
  Y.applyUpdate(ydocA, Y.encodeStateAsUpdate(ydocB))
}

export const syncAwareness = (source, target, clientId) => {
  const update = encodeAwarenessUpdate(source, [clientId])
  applyAwarenessUpdate(target, update, 'test')
}

export const publishRemoteCursor = (view, awareness, remoteClientId, pos) => {
  const ystate = ySyncPluginKey.getState(view.state)
  const anchorRel = absolutePositionToRelativePosition(
    pos,
    ystate.type,
    ystate.binding.mapping
  )
  const headRel = absolutePositionToRelativePosition(
    pos,
    ystate.type,
    ystate.binding.mapping
  )
  awareness.states.set(remoteClientId, {
    user: { name: 'Remote User', color: '#ff0000' },
    cursor: { anchor: anchorRel, head: headRel }
  })
  view.dispatch(view.state.tr.setMeta(yCursorPluginKey, { awarenessUpdated: true }))
}

export const getRemoteCursorWidgetPos = (view) => {
  const decos = yCursorPluginKey.getState(view.state)
  const found = decos.find(0, view.state.doc.content.size)
  const widget = found.find((d) => d.spec && d.spec.side === 10)
  return widget != null ? widget.from : null
}
