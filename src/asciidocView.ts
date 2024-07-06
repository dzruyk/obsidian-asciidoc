import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TextFileView, TFile } from 'obsidian';
import { ItemView, ViewStateResult, WorkspaceLeaf } from 'obsidian';
import { Component, editorInfoField } from 'obsidian';

import AsciidocPlugin from "./main"

import asciidoctor from 'asciidoctor'

import Mark from 'mark.js'

//import { StreamLanguage } from "@codemirror/language";
import { openSearchPanel } from "@codemirror/search"

import { StreamLanguage, syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { EditorView, highlightActiveLine, lineNumbers } from "@codemirror/view";
import { EditorState } from "@codemirror/state";

import { basicExtensions } from "./codemirror";

import { asciidoc } from "codemirror-asciidoc";

export const ASCIIDOC_EDITOR_VIEW = "asciidoc-editor-view";

//import 'codemirror/lib/codemirror.css'

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

class SearchCtx {
  private isSearchActive: boolean;
  private mark: any;
  private root: HTMLElement;
  private resultOffset: number;
  private searchBox: HTMLElement;
  private searchContainer: HTMLElement;

  constructor(rootDiv: HTMLElement, searchContainer: HTMLElement) {
    this.root = rootDiv;
    this.mark = new Mark(rootDiv);
    this.isSearchActive = false;
    this.resultOffset = 0;
    this.searchBox = null;
    this.searchContainer = searchContainer;

  }

  render() {
    this.isSearchActive = true;

    let searchDialog = '<span class="CodeMirror-search-label">Search:</span> <input type="text" style="width: 10em" class="CodeMirror-search-field"/> <span style="color: #888" class="CodeMirror-search-hint"></span>';

    let searchBox = document.createElement("div");
    searchBox.className = "CodeMirror-dialog CodeMirror-dialog-top";
    searchBox.innerHTML = searchDialog;
    this.searchContainer.insertBefore(searchBox, this.searchContainer.children[0]);

    let collection = searchBox.getElementsByTagName("input");
    collection[0].addEventListener("keyup", (e: KeyboardEvent) => {
      if (e.keyCode == 13) {
        this.search(collection[0].value);
      }
    }, true)
    collection[0].focus();

    this.searchBox = searchBox;
  }

  search(s: string) {
    if (!this.isSearchActive) {
      this.resultOffset = 0;
    }
    this.isSearchActive = true;
    console.log("nextsearch")
    this.mark.unmark();
    this.mark.mark(s, { separateWordSearch: false } );
    let elements = this.root.getElementsByTagName("mark");
    if (elements.length != 0) {
      if (this.resultOffset >= elements.length)
        this.resultOffset = 0;

      elements[this.resultOffset].scrollIntoView();
      this.resultOffset += 1;
    }
  }

  focus() {
    if (this.isSearchActive) {
      let collection = this.searchBox.getElementsByTagName("input");
      if (collection.length)
        collection[0].focus();
      return;
    } else {
      this.render();
    }
  }

  resetSearch() {
    if (this.isSearchActive) {
      this.searchBox.remove();
    }
    this.isSearchActive = false;
    //this.searchBox.hidden = true;
  }
}

export class AsciidocView extends TextFileView {
  private pageData: string; //TODO: for view-only mode
  private plugin: AsciidocPlugin;
  private div: any;
  private viewerOptions: any;
  private adoc: any;
  private cm: any;
  private sctx: SearchCtx;

  private editorView: EditorView;


  constructor(plugin: AsciidocPlugin, leaf: WorkspaceLeaf) {
    super(leaf);
    this.plugin = plugin;
    this.div = null;
    console.log("CONSTRUCTORR");
    console.log(CodeMirror);
    console.log(this.plugin);


    // For viewer mode
    this.adoc = asciidoctor();
    this.viewerOptions = {
      standalone: false,
      safe: 'safe',
      attributes: { 'showtitle': true, 'icons': 'font' }
    };

    let tmp = document.createElement("div");

    let editorState = EditorState.create({
      extensions: [
        StreamLanguage.define(asciidoc),
        basicExtensions,
        lineNumbers(),
        highlightActiveLine(),
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
      parent: this.contentEl,
    });




    //this.plugin.registerEditorExtension
   /*
    this.cm = CodeMirror(tmp,
    {
      tabSize: 2,
      mode: "asciidoc",
      lineNumbers: true,
      lineWrapping: true,
      // @ts-ignore
      line: true,
      styleActiveLine: true,
      highlightSelectionMatches: {
        annotateScrollbar: true
      },
      viewportMargin: 2,
      inputStyle: 'contenteditable',
      allowDropFileTypes: ['image/jpg', 'image/png', 'image/svg', 'image/jpeg', 'image/gif'],
      gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter']
    })
    */

    this.addAction("book-open", "preview/editor mode", (evt: MouseEvent ) => { this.changeViewMode() });
  }

  changeViewMode() {
    isEditMode = !isEditMode;
    console.log("change edit mode ", isEditMode);
    deleteChildNodes(this.div);
    this.renderCurrentMode();
  }

  renderCurrentMode() {
    if (!this.div) {
      console.log("SHOULD NOT REACH");
    }

    if (isEditMode) {
      console.log("render editor");
      this.div.appendChild(this.editorView.dom);
      //this.cm.refresh();
    } else {
      console.log("render viewer");
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
    let collection = dataEl.getElementsByTagName("a");

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
        console.log(`CLICK ${txt}`);
        this.app.workspace.openLinkText(txt, '', false);
      }
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
    console.log("onLoadFile", isEditMode);

    if (this.div == null)
      this.div = this.contentEl.createEl("div", { cls: "adoc-view" });

    this.renderCurrentMode()
    this.addKeyEvents();
    await super.onLoadFile(file);
  }

  async onUnloadFile(file: TFile) {
    console.log("onUnloadFile ", isEditMode)
    window.removeEventListener('keydown', this.keyHandle, true);
    await super.onUnloadFile(file);
    deleteChildNodes(this.div);
  }

  async onClose() {
    await super.onClose();
    console.log("onClose")
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
    console.log(`setViewData ${clear} ${data.substr(0, 10)}`)
    this.pageData = data;
    //this.cm.setValue(data)
    this.editorView.dispatch({
      changes: {
        from: 0,
        to: this.editorView.state.doc.length,
        insert: data}
    })
    if (isEditMode) {
      console.log(`TODO_REFRESH ${data.substr(0, 10)}`);
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
  console.log("CLEAR")
    this.editorView.dispatch({
      changes: {
        from: 0,
        to: this.editorView.state.doc.length,
        insert: ""}
    })
  }

  addKeyEvents() {
    window.addEventListener('keydown', this.keyHandle, true);
  }

  private keyHandle = (event: KeyboardEvent) => {
    if (app.workspace.activeLeaf != this.leaf)
      return;

    type myCallback = () => void;
    const ctrlMap = new Map<number, myCallback >([
      /* "f" */ [70, () => { this.commandFind() } ],
      /* "e" */ [69, () => { this.changeViewMode() } ],

    ]);
    if (event.ctrlKey) {
      const cb = ctrlMap.get(event.keyCode);
      if (cb)
        cb()
    } else if (event.key == 'Escape') {
      this.commandEsc()
    }
  }

  commandFind() {
    console.log("command find!");
    if (isEditMode) {
      openSearchPanel(this.editorView);
    } else {
      this.sctx.focus();
    }
  }

  commandEsc() {
    console.log('esc')
    if (isEditMode)
      return;
    this.sctx.resetSearch();
  }
}

