import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TextFileView, TFile } from 'obsidian';
import { ItemView, ViewStateResult, WorkspaceLeaf } from 'obsidian';
import { Command, Component, editorInfoField, loadPrism } from 'obsidian';

import asciidoctor from 'asciidoctor'

//import { StreamLanguage } from "@codemirror/language";
import { tags } from "@lezer/highlight"
import { HighlightStyle } from "@codemirror/language"
import { openSearchPanel } from "@codemirror/search"

import { StreamLanguage, syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { EditorView, highlightActiveLine, lineNumbers } from "@codemirror/view";
import { EditorState } from "@codemirror/state";

// syntax highlighting related
import { ViewPlugin, ViewUpdate, Decoration, DecorationSet } from "@codemirror/view";
import { Prec, RangeSetBuilder } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { SyntaxNodeRef, Tree } from "@lezer/common";
import { Highlighter, highlightTree } from "@lezer/highlight";


import AsciidocPlugin from "./main"
import { basicExtensions } from "./codemirror";
import { SearchCtx } from "./searchCtx";
import { asciidoc } from "codemirror-asciidoc";

export const ASCIIDOC_EDITOR_VIEW = "asciidoc-editor-view";

declare var CodeMirror: any;
declare var Prism: any;

function adoc() {return asciidoc; }
CodeMirror.defineMode("asciidoc", adoc)
CodeMirror.defineMIME("text/asciidoc", "asciidoc")

loadPrism().then(x => { })

/*
 * 13 -- is magic number for node property
 * that stores highlight type info.
 * Codemirror allows you to add additional info to nodes using class `NodeProp`.
 * Every new `NodeProp` reserves its own index.
 * Codemirror defines several public NodeProp, for example
 * NodeProp.lookAhead, NodeProp.mounted
 * But obisidian defines it's own properties and it's part of private API that we can't acces, so we use this magic number and hope its works stable enough.
*/
const tokenInfoPropId: number = 13;

function getHighlighters(state:any) {
  return [defaultHighlightStyle];
}

// Since Obsidian uses modified Codemirror version we can't rely on
// regular syntaxHighlighting and need to implement our highlighter from scratch
class TreeHighlighterEx {
  decorations: DecorationSet
  decoratedTo: number
  tree: Tree
  tokenCache: {[cls: string]: Decoration}

  constructor(view: EditorView) {
    this.tree = syntaxTree(view.state)
    this.decorations = this.buildDeco(view, getHighlighters(view.state))
    this.decoratedTo = view.viewport.to
    this.tokenCache = Object.create(null)
  }

  update(update: ViewUpdate) {
    let tree = syntaxTree(update.state), highlighters = getHighlighters(update.state)
    let styleChange = highlighters != getHighlighters(update.startState)
    let {viewport} = update.view, decoratedToMapped = update.changes.mapPos(this.decoratedTo, 1)
    if (tree.length < viewport.to && !styleChange && tree.type == this.tree.type && decoratedToMapped >= viewport.to) {
      this.decorations = this.decorations.map(update.changes)
      this.decoratedTo = decoratedToMapped
    } else if (tree != this.tree || update.viewportChanged || styleChange) {
      this.tree = tree
      this.decorations = this.buildDeco(update.view, highlighters)
      this.decoratedTo = viewport.to
    }
  }

  buildDeco(view: EditorView, highlighters: readonly Highlighter[] | null) {
    if (!highlighters || !this.tree.length) return Decoration.none

    let builder = new RangeSetBuilder<Decoration>()

    for (let rangeIter of view.visibleRanges) {
      let _this = this;

      function treeHandler (n: any/*SyntaxNodeRef*/) {
        try {
          let nm = n.type.props[tokenInfoPropId];
          if (!nm)
            return
          let cachedEntry
          if (!(cachedEntry = _this.tokenCache[nm])) {
            let m = {
              class: nm.split(" ").map((item: string) => "cm-" + item).join(" "),
                attributes: {
                spellcheck: "false"
              }
            }
            cachedEntry = _this.tokenCache[nm] = Decoration.mark(m)
          }
          builder.add(n.from, n.to, cachedEntry)
        } catch (err) {
          console.log(err);
        }
      }

      this.tree.iterate({
        from: rangeIter.from,
        to: rangeIter.to,
        enter: treeHandler,
      })
    }
    return builder.finish()
  }
}

const treeHighlighterEx =Prec.high(ViewPlugin.fromClass(TreeHighlighterEx, {
    decorations: v => v.decorations
}));


type myCallback = () => void;

class KeyInfo {

  constructor(keyName: string, isShift: boolean = false, isCtrl: boolean = false, isAlt: boolean = false) {
    this.keyName = keyName;
    //assume this is some keyboard key
    if (this.keyName.length == 1)
      this.keyName = "Key" + this.keyName.toUpperCase();
    this.mask = this.modifiersToMask(isShift, isCtrl, isAlt);
  }

  modifiersToMask(isShift: boolean = false, isCtrl: boolean = false, isAlt: boolean = false): number {
    let modifiers = 0;
    if (isShift)
      modifiers |= 1;
    if (isCtrl)
      modifiers |= 2;
    if (isAlt)
      modifiers |= 4;
    return modifiers;
  }

  static fromHotkey(hk: Hotkey) {
    let keyName = hk.key
    let checkModifier = (modName) => modName.includes(hk.modifiers)
    return new KeyInfo(keyName, checkModifier("Shift"), checkModifier("Mod"), checkModifier("Alt"))
  }

  matchEventModifiers(event: KeyboardEvent): true {
    let mask = this.modifiersToMask(event.shiftKey, event.ctrlKey, event.altKey);
    if ((this.mask & mask) == this.mask)
      return true
    return false
  }
}

class KeyboarCallbacks {
  keyMap: Map<int, KeyInfo>;
  callbacks: Map<int, myCallback>;

  constructor() {
    this.keyMap = new Map<string, KeyInfo>()
    this.callbacks = new Map<string, myCallback>()
  }

  registerKey(ki: KeyInfo, callback) {
    this.keyMap.set(ki.keyName, ki);
    this.callbacks.set(ki.keyName, callback);
  }

  registerObsidianHotkey(hk: Hotkey, defaultKey: KeyInfo, callback: myCallback) {
    let ki;
    if (hk) {
      ki = KeyInfo.fromHotkey(hk);
    } else {
      ki = defaultKey;
    }
    this.registerKey(ki, callback);
  }

  handleKeyboardEvent(event: KeyboardEvent) {
    let ki = this.keyMap.get(event.code);
    if (!ki)
      return;
    if (ki.matchEventModifiers(event)) {
      this.callbacks.get(ki.keyName)();
    }
  }
}

function isValidUrl(str: string): boolean {
  let url;
  try {
    url = new URL(str);
  } catch (_) {
    return false;
  }
  return true
}

function deleteChildNodes(el: any) {
    while (el.hasChildNodes())
      el.removeChild(el.children[0]);
}

let isEditMode = true;

export class AsciidocView extends TextFileView {
  private pageData: string; //TODO: for view-only mode
  private plugin: AsciidocPlugin;
  private div: any;
  private viewerOptions: any;
  private adoc: any;
  private cm: any;
  private sctx: SearchCtx;

  private editorView: EditorView;
  private keyMap: KeyboardCallbacks;


  constructor(plugin: AsciidocPlugin, leaf: WorkspaceLeaf) {
    super(leaf);
    this.plugin = plugin;
    this.div = null;

    // For viewer mode
    this.adoc = asciidoctor();
    this.viewerOptions = {
      standalone: false,
      safe: 'safe',
      attributes: { 'showtitle': true, 'icons': 'font' }
    };
    this.keyMap = new KeyboarCallbacks()

    let tmp = document.createElement("div");

    let editorState = EditorState.create({
      extensions: [
        basicExtensions,
        lineNumbers(),
        treeHighlighterEx,
        highlightActiveLine(),
        StreamLanguage.define(asciidoc),
        // TODO: Figure out how to nicely set language modes.
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            this.save(false);
          }
        }),
      ],
    });
    this.editorView = new EditorView({
      state: editorState,
      //parent: this.contentEl,
    });

    this.addAction("book-open", "preview/editor mode", (evt: MouseEvent ) => { this.changeViewMode() });
  }

  changeViewMode() {
    isEditMode = !isEditMode;
    deleteChildNodes(this.div);
    this.renderCurrentMode();
  }

  renderCurrentMode() {
    if (!this.div) {
    }

    if (isEditMode) {
      this.div.appendChild(this.editorView.dom);
      //this.cm.refresh();
    } else {
      this.div.appendChild(this.renderViewerMode());
    }
  }

  renderViewerMode() {
    //let contents = this.cm.getValue();
    let contents = this.editorView.state.doc.toString();
    let htmlStr = this.adoc.convert(contents, this.viewerOptions);

    let parser = new window.DOMParser();

    let dataEl = document.createElement("div");

    dataEl.innerHTML = htmlStr;
    try {
      let collection : any = dataEl.getElementsByTagName("a");

      while (collection.length > 0) {
        let item = collection[0];

        let txt = item.getText().trim();
        let cls = "cm-hmd-internal-link";
        if (isValidUrl(txt)) {
          cls = "cm-url";
        }
        let s = `<span class="${cls}" spellcheck="false"><span class="cm-underline" draggable="true"> ${txt} </span></span>`;
        let div = document.createElement('div');
        div.innerHTML = s;
        if (item.parentNode) {
          item.parentNode.replaceChild(div, item);
        }

        div.onclick = () => {
          this.app.workspace.openLinkText(txt, '', false);
        }
      }

      collection = dataEl.getElementsByTagName("pre");
      for (let item of collection) {
        if (item.className == "highlight" && item.children.length == 1) {
          let className = item.children[0].className;
          if (className == "language-diagram") {
            // render drawio svg image (for processing asciidoc wiki.js pages)
            let html = atob(item.children[0].innerText);
            //sanitize html contents for security reasons
            const parser = new DOMParser();
            let diagramDoc: any = parser.parseFromString(html, "application/xml");
            let svg;
            if (diagramDoc) {
              for (let child of diagramDoc.childNodes) {
                if (child.tagName != "svg")
                  continue;
                svg = child;
                break;
              }
            }
            if (svg) {
              for (let child of svg.children) {
                if (child.tagName && child.tagName.toLowerCase() == "script")
                  svg.removeChild(child);
              }
              item.replaceChild(svg, item.lastChild);
            }

          } else if (className.startsWith("language-")) {
            item.className = className;
            Prism.highlightElement(item);
          }
        }
      }

      collection = dataEl.getElementsByTagName("img");
      for (let item of collection) {
        let path = item.src
        let commonPrefix = "app://obsidian.md/"
        if (path.startsWith(commonPrefix)) {
          path = path.substr(commonPrefix.length)
        }
        path = unescape(path);
        let file = this.app.vault.getAbstractFileByPath(path);

        if (file) {
          item.src = this.app.vault.getResourcePath(<TFile>file);
        }
      }
    } catch (err) {
      console.log(err);
    }

    let root = document.createElement("div");
    root.appendChild(dataEl)

    this.sctx = new SearchCtx(dataEl, root);
    return root;
  }

  async onOpen() {
    await super.onOpen();
  }

  async onLoadFile(file: TFile) {
    if (this.div == null)
      this.div = this.contentEl.createEl("div", { cls: "adoc-view" });

    this.renderCurrentMode()
    this.addKeyEvents();
    await super.onLoadFile(file);
  }

  async onUnloadFile(file: TFile) {
    window.removeEventListener('keydown', this.keyHandle, true);
    await super.onUnloadFile(file);
    deleteChildNodes(this.div);
  }

  async onClose() {
    await super.onClose();
  }

  onResize() {
  }

  getContext(file?: TFile) {
    return file?.path ?? this.file?.path;
  }

  getViewType() {
    return ASCIIDOC_EDITOR_VIEW;
  }

  getViewData = () => {
    return this.editorView.state.doc.toString();
  }

  setViewData = (data: string, clear: boolean) => {
    this.pageData = data;
    //this.cm.setValue(data)
    this.editorView.dispatch({
      changes: {
        from: 0,
        to: this.editorView.state.doc.length,
        insert: data}
    })
    if (isEditMode) {
      //this.cm.refresh();
    }
    if (clear) {
      if (!isEditMode) {
        deleteChildNodes(this.div);
        this.div.appendChild(this.renderViewerMode());
      }
    }
  }

  clear = () => {
    this.editorView.dispatch({
      changes: {
        from: 0,
        to: this.editorView.state.doc.length,
        insert: ""}
    })
  }

  addKeyEvents() {
    // For our Asciidoc view We need to override some obsidian markdown related hotkeys
    let getHotkey = (nm) => {
      if (this.app.hotkeyManager) {
        let tmp =  this.app.hotkeyManager.customKeys[nm]
        if (tmp && tmp.length)
          return tmp[0]
      }

      let command = this.app.commands.findCommand(nm)

      if (command.hotkeys && command.hotkeys.length > 0) {
        return command.hotkeys[0];
      }
      return undefined;
    }

    this.keyMap.registerObsidianHotkey(getHotkey("markdown:toggle-preview"),
        new KeyInfo("E", false, true, false),
        () => { this.changeViewMode() } )
    this.keyMap.registerObsidianHotkey(getHotkey("editor:open-search"),
        new KeyInfo("F", false, true, false),
        () => { this.commandFind() })
    this.keyMap.registerKey(new KeyInfo("Escape"), () => { this.commandEsc() })

    window.addEventListener('keydown', this.keyHandle, true);
  }

  private keyHandle = (event: KeyboardEvent) => {
    if (this.app.workspace.activeLeaf != this.leaf)
      return;

    this.keyMap.handleKeyboardEvent(event);
  }

  commandFind() {
    if (isEditMode) {
      openSearchPanel(this.editorView);
    } else {
      this.sctx.focus();
    }
  }

  commandEsc() {
    if (isEditMode)
      return;
    this.sctx.resetSearch();
  }
}

