import {
  ButtonComponent,
  Modal,
  normalizePath,
  Notice,
  TAbstractFile,
  TextComponent,
  TFile,
  TFolder
} from "obsidian";

import AsciidocPlugin from "./main"

export class AdocNewFileModal extends Modal {
  fileName = "new_name";
  ext = "adoc";
  parent: TAbstractFile;

  constructor(private plugin: AsciidocPlugin, parent?: TAbstractFile) {
    super(plugin.app);
    this.parent = parent ?? this.plugin.app.vault.getRoot();
  }

  onOpen() {
    const {contentEl} = this;
    contentEl.addClass("new-adoc-modal");
    const pathInput = new TextComponent(contentEl);
    pathInput.inputEl.addClass("modal_input");
    pathInput.setValue(this.fileName);
    pathInput.inputEl.addEventListener("keypress", e => {
      if (e.key === "Enter") {
        this.complete();
      }
    });
    pathInput.onChange(value => this.fileName = value);

    const submitButton = new ButtonComponent(contentEl);
    submitButton.setCta();
    submitButton.setButtonText("Create");
    submitButton.onClick(() => this.complete());

    pathInput.inputEl.focus();
  }

  async complete() {
    this.close();
    const parent = (this.parent instanceof TFile ? this.parent.parent : this.parent) as TFolder;
    const newPath = `${parent.path}/${this.fileName}.${this.ext}`;
    const existingFile = this.app.vault.getAbstractFileByPath(normalizePath(newPath));
    if (existingFile && existingFile instanceof TFile) {
      new Notice("File already exists");
      const leaf = this.app.workspace.getLeaf(true);
      leaf.openFile(existingFile as any);
      return;
    }

    const newFile = await this.app.vault.create(
      newPath,
      "",
      {}
    );

    const leaf = this.app.workspace.getLeaf(true);
    leaf.openFile(newFile);
  }

  onClose() {
    const {contentEl} = this;
    contentEl.empty();
  }
}

