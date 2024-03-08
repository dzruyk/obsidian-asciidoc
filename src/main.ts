import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { ItemView, ViewStateResult, WorkspaceLeaf } from 'obsidian';
import { Component, editorInfoField } from 'obsidian';

import asciidoctor from 'asciidoctor'

export const ASCIIDOC_EDITOR_VIEW = "asciidoc-editor-view";

///////
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import { EditorSelection, EditorState, Range } from "@codemirror/state";
import {syntaxHighlighting, defaultHighlightStyle} from "@codemirror/language"

import { StreamLanguage } from "@codemirror/language"
import { asciidoc as cmAdoc } from "codemirror-asciidoc"
import { basicSetup } from "codemirror"

class MyExamplePlugin implements PluginValue {
  constructor(view: EditorView) {
    // ...
  }

  update(update: ViewUpdate) {
    console.log("update")
    console.log(update)
    // ...
  }

  destroy() {
    // ...
  }
}

const ExamplePlugin = ViewPlugin.fromClass(MyExamplePlugin);


function asciidocEditorPlugin(/*app: App, index: FullIndex, settings: DataviewSettings, api: DataviewApi*/) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      component: Component;

      constructor(view: EditorView) {
        this.component = new Component();
        this.component.load();
        this.decorations = this.inlineRender(view) ?? Decoration.none;
      }
      update(update: ViewUpdate) {
        console.log("update")
        if (!update.state.field(editorLivePreviewField)) {
          this.decorations = Decoration.none;
          return;
        }
        if (update.docChanged) {
          this.decorations = this.decorations.map(update.changes);
          this.updateTree(update.view);
        } else if (update.selectionSet) {
          this.updateTree(update.view);
        } else if (update.viewportChanged /*|| update.selectionSet*/) {
          this.decorations = this.inlineRender(update.view) ?? Decoration.none;
        }
      }
      updateTree(view: EditorView) {
        console.log("updateTree")
      }
      inlineRender(view: EditorView) {
        const currentFile = view.state.field(editorInfoField).file;
        console.log("inlineRender " + currentFile)
        if (!currentFile) return;

      }
      /*
      removeDeco(node: SyntaxNode) {
        console.log("removeDeco")
      }
      addDeco(node: SyntaxNode, view: EditorView) {
        console.log("addDeco")
      }
      renderNode(view: EditorView, node: SyntaxNode) {
      }
      */
     destroy() {
       this.component.unload();
     }
    },
    { decorations: v => v.decorations }
  )

      /*

  let view = new EditorView({
    state: EditorState.create({
      extensions: [basicSetup, StreamLanguage.define(cmAdoc)]
    })
  })
  return view;
  */

}

export class AsciidocView extends ItemView {
  private state: any;
  private plugin: AsciidocPlugin;

  constructor(plugin: AsciidocPlugin, leaf: WorkspaceLeaf) {
    super(leaf);
    this.plugin = plugin;
    this.adoc = asciidoctor();
    this.path = '';
    this.options = {
      standalone: false,
      safe: 'safe',
      attributes: { 'showtitle': true, 'icons': 'font' }
    };
	console.log(cmAdoc)
	this.cm = new EditorView({
		doc: "helloworld",
		mode: "asciidoc",
		state: EditorState.create({
			extensions: [basicSetup, StreamLanguage.define(cmAdoc)],
		}),
		extensions: [cmAdoc],
		parent: this.contentEl,
		lineNumbers: true,
		lineWrapping: true,
		line: true,
		styleActiveLine: true,

		highlightSelectionMatches: {
			annotateScrollbar: true
		},
		viewportMargin: 50,
		inputStyle: 'contenteditable',
		allowDropFileTypes: ['image/jpg', 'image/png', 'image/svg', 'image/jpeg', 'image/gif'],
	})

	/*
	this.cm.on('change', c => {
		console.log("CM change")
	})
	*/

  }

  getViewType() {
	  return ASCIIDOC_EDITOR_VIEW;
  }

  getDisplayText() {
	  if (!this.path) {
		  return "Asciidoc Editor";
	  } else {
		  return this.path;
	  }
  }

  async setState(state: any, result: ViewStateResult): Promise<void> {
	console.log("setState!!!")
	console.log(state)

	let txt = "";
	if ('data' in state) {
		this.state = state
		txt = "**TODO!**"
		console.log("TODO!!!")
	}
	if ('file' in state) {
		this.path = state.file;
		let tfile = this.app.vault.getFileByPath(this.path);
		txt = await this.app.vault.read(tfile);
		console.log("set contents")
		//this.cm.doc = contents;
		//htmlStr = this.adoc.convert(contents, this.options);
	}

	this.cm.dispatch({
		changes: {from: 0, to: this.cm.state.doc.length, insert: txt }
	})

	  /*
		 this.containerEl.children[1]

		 let dom = (new window.DOMParser()).parseFromString( htmlStr, 'text/html' );
	  //div.innerHTML = dom.documentElement.outerHTML;
	  */
	  /*
		 if ('file' in state) {
		 this.path = state.file;
		 let tfile = this.app.vault.getFileByPath(state.file);
		 const contents = await this.app.vault.read(tfile);
		 htmlStr = this.adoc.convert(contents, this.options);
		 }
		 div.innerHTML = htmlStr;
		 */

  }

  async getState() {
	  return Promise.resolve(this.state);
  }

  async onOpen() {
	  console.log("OPEN!")
	  const container = this.containerEl.children[1];
	  console.log(container)
  }

  async onClose() {
	  console.log("CLOSE!")
  }

  registerDomEvent(el: any, type: FocusEvent, callback: any): void {
	  console.log('focssed')
  }
}


// Remember to rename these classes and interfaces!

interface MyPluginSettings {
  mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
  mySetting: 'default'
}

export default class AsciidocPlugin extends Plugin {
  settings: MyPluginSettings;

  async onload() {
    await this.loadSettings();

    this.cmExtension = []
    this.registerEditorExtension([this.cmExtension]);
    this.updateEditorExtensions();

    console.log("this.app.workspace")
    console.log(this.app.workspace)
    this.registerExtensions(["adoc", "asciidoc"], ASCIIDOC_EDITOR_VIEW);
    console.log(this)


    this.registerView(ASCIIDOC_EDITOR_VIEW, (leaf) => new AsciidocView(this, leaf))


    // This creates an icon in the left ribbon.
    const ribbonIconEl = this.addRibbonIcon('dice', 'Sample Plugin', (evt: MouseEvent) => {
      // Called when the user clicks the icon.
      new Notice('This is a notice!');
    });

    // Perform additional things with the ribbon
    ribbonIconEl.addClass('my-plugin-ribbon-class');

    // This adds a status bar item to the bottom of the app. Does not work on mobile apps.
    const statusBarItemEl = this.addStatusBarItem();
    statusBarItemEl.setText('Status Bar Text');

    // This adds a simple command that can be triggered anywhere
    this.addCommand({
      id: 'open-sample-modal-simple',
      name: 'Open sample modal (simple)',
      callback: () => {
        new SampleModal(this.app).open();
      }
    });
    // This adds an editor command that can perform some operation on the current editor instance
    this.addCommand({
      id: 'sample-editor-command',
      name: 'Sample editor command',
      editorCallback: (editor: Editor, view: MarkdownView) => {
        console.log(editor.getSelection());
        editor.replaceSelection('Sample Editor Command');
      }
    });
    // This adds a complex command that can check whether the current state of the app allows execution of the command
    this.addCommand({
      id: 'open-sample-modal-complex',
      name: 'Open sample modal (complex)',
      checkCallback: (checking: boolean) => {
        // Conditions to check
        const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (markdownView) {
          // If checking is true, we're simply "checking" if the command can be run.
          // If checking is false, then we want to actually perform the operation.
          if (!checking) {
            new SampleModal(this.app).open();
          }

          // This command will only show up in Command Palette when the check function returns true
          return true;
        }
      }
    });

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new SampleSettingTab(this.app, this));

    // If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
    // Using this function will automatically remove the event listener when this plugin is disabled.
    this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
      console.log('click', evt);
    });

    // When registering intervals, this function will automatically clear the interval when the plugin is disabled.
    this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
  }

  public updateEditorExtensions() {
    this.cmExtension.length = 0;
    this.cmExtension.push(ExamplePlugin)
    //this.cmExtension.push(asciidocEditorPlugin(/*this.app, this.index, this.settings, this.api*/));
    this.app.workspace.updateOptions();

  }

  onunload() {
    this.app.viewRegistry.unregisterExtensions([".adoc", ".asciidoc"]);
    //this.registerExtensions([".md"], 'markdown');
    this.app.workspace.detachLeavesOfType(ASCIIDOC_EDITOR_VIEW);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class SampleModal extends Modal {
  constructor(app: App) {
    super(app);
  }

  onOpen() {
    const {contentEl} = this;
    contentEl.setText('Woah!');
  }

  onClose() {
    const {contentEl} = this;
    contentEl.empty();
  }
}

class SampleSettingTab extends PluginSettingTab {
  plugin: MyPlugin;

  constructor(app: App, plugin: MyPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const {containerEl} = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName('Setting #1')
      .setDesc('It\'s a secret')
      .addText(text => text
        .setPlaceholder('Enter your secret')
        .setValue(this.plugin.settings.mySetting)
        .onChange(async (value) => {
          this.plugin.settings.mySetting = value;
          await this.plugin.saveSettings();
        }));
  }
}
