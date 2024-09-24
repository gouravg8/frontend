import { mdiGestureTap, mdiListBox } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { cache } from "lit/directives/cache";
import memoizeOne from "memoize-one";
import {
  any,
  array,
  assert,
  assign,
  enums,
  object,
  optional,
  string,
} from "superstruct";
import { fireEvent, HASSDomEvent } from "../../../../common/dom/fire_event";
import { LocalizeFunc } from "../../../../common/translations/localize";
import "../../../../components/ha-expansion-panel";
import "../../../../components/ha-form/ha-form";
import type {
  HaFormSchema,
  SchemaUnion,
} from "../../../../components/ha-form/types";
import "../../../../components/ha-svg-icon";
import type { HomeAssistant } from "../../../../types";
import type { HeadingCardConfig, HeadingEntityConfig } from "../../cards/types";
import { UiAction } from "../../components/hui-action-editor";
import type { LovelaceCardEditor } from "../../types";
import "../hui-sub-element-editor";
import { processEditorEntities } from "../process-editor-entities";
import { actionConfigStruct } from "../structs/action-struct";
import { baseLovelaceCardConfig } from "../structs/base-card-struct";
import { SubElementEditorConfig } from "../types";
import { configElementStyle } from "./config-elements-style";
import "./hui-entities-editor";

const actions: UiAction[] = ["navigate", "url", "perform-action", "none"];

const cardConfigStruct = assign(
  baseLovelaceCardConfig,
  object({
    heading_style: optional(enums(["title", "subtitle"])),
    heading: optional(string()),
    icon: optional(string()),
    tap_action: optional(actionConfigStruct),
    entities: optional(array(any())),
  })
);

@customElement("hui-heading-card-editor")
export class HuiHeadingCardEditor
  extends LitElement
  implements LovelaceCardEditor
{
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: HeadingCardConfig;

  @state()
  private _subElementEditorConfig?: SubElementEditorConfig;

  public setConfig(config: HeadingCardConfig): void {
    assert(config, cardConfigStruct);
    this._config = config;
  }

  private _schema = memoizeOne(
    (localize: LocalizeFunc) =>
      [
        {
          name: "heading_style",
          selector: {
            select: {
              mode: "dropdown",
              options: ["title", "subtitle"].map((value) => ({
                label: localize(
                  `ui.panel.lovelace.editor.card.heading.heading_style_options.${value}`
                ),
                value: value,
              })),
            },
          },
        },
        { name: "heading", selector: { text: {} } },
        {
          name: "icon",
          selector: {
            icon: {},
          },
        },
        {
          name: "interactions",
          type: "expandable",
          flatten: true,
          iconPath: mdiGestureTap,
          schema: [
            {
              name: "tap_action",
              selector: {
                ui_action: {
                  default_action: "none",
                  actions,
                },
              },
            },
          ],
        },
      ] as const satisfies readonly HaFormSchema[]
  );

  protected render() {
    if (!this.hass || !this._config) {
      return nothing;
    }

    return cache(
      this._subElementEditorConfig
        ? this._renderEntityForm()
        : this._renderForm()
    );
  }

  private _renderEntityForm() {
    return html`
      <hui-sub-element-editor
        .hass=${this.hass}
        .config=${this._subElementEditorConfig}
        @go-back=${this._goBack}
        @config-changed=${this._subElementChanged}
      >
      </hui-sub-element-editor>
    `;
  }

  private _entities = memoizeOne((entities: HeadingCardConfig["entities"]) =>
    processEditorEntities(entities || [])
  );

  private _renderForm() {
    const data = {
      ...this._config!,
    };

    if (!data.heading_style) {
      data.heading_style = "title";
    }

    const schema = this._schema(this.hass!.localize);

    return html`
      <ha-form
        .hass=${this.hass}
        .data=${data}
        .schema=${schema}
        .computeLabel=${this._computeLabelCallback}
        @value-changed=${this._valueChanged}
      ></ha-form>
      <ha-expansion-panel outlined>
        <h3 slot="header">
          <ha-svg-icon .path=${mdiListBox}></ha-svg-icon>
          ${this.hass!.localize(
            "ui.panel.lovelace.editor.card.heading.entities"
          )}
        </h3>
        <div class="content">
          <hui-entities-editor
            .hass=${this.hass}
            .entities=${this._entities(this._config!.entities)}
            @entities-changed=${this._entitiesChanged}
            @edit-entity=${this._editEntity}
          >
          </hui-entities-editor>
        </div>
      </ha-expansion-panel>
    `;
  }

  private _entitiesChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    if (!this._config || !this.hass) {
      return;
    }

    const config = {
      ...this._config,
      entities: ev.detail.entities as HeadingEntityConfig[],
    };

    fireEvent(this, "config-changed", { config });
  }

  private _valueChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    if (!this._config || !this.hass) {
      return;
    }

    const config = ev.detail.value as HeadingCardConfig;

    fireEvent(this, "config-changed", { config });
  }

  private _subElementChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    if (!this._config || !this.hass) {
      return;
    }

    const value = ev.detail.config;

    const newConfigEntities = this._config!.entities
      ? [...this._config!.entities]
      : [];

    if (!value) {
      newConfigEntities.splice(this._subElementEditorConfig!.index!, 1);
      this._goBack();
    } else {
      newConfigEntities[this._subElementEditorConfig!.index!] = value;
    }

    this._config = { ...this._config!, entities: newConfigEntities };

    this._subElementEditorConfig = {
      ...this._subElementEditorConfig!,
      elementConfig: value,
    };

    fireEvent(this, "config-changed", { config: this._config });
  }

  private _editEntity(ev: HASSDomEvent<{ index: number }>): void {
    const entities = this._entities(this._config!.entities);
    this._subElementEditorConfig = {
      elementConfig: entities[ev.detail.index],
      index: ev.detail.index,
      type: "heading-entity",
    };
  }

  private _goBack(): void {
    this._subElementEditorConfig = undefined;
  }

  private _computeLabelCallback = (
    schema: SchemaUnion<ReturnType<typeof this._schema>>
  ) => {
    switch (schema.name) {
      case "heading_style":
      case "heading":
        return this.hass!.localize(
          `ui.panel.lovelace.editor.card.heading.${schema.name}`
        );
      default:
        return this.hass!.localize(
          `ui.panel.lovelace.editor.card.generic.${schema.name}`
        );
    }
  };

  static get styles() {
    return [
      configElementStyle,
      css`
        .container {
          display: flex;
          flex-direction: column;
        }
        ha-form {
          display: block;
          margin-bottom: 24px;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-heading-card-editor": HuiHeadingCardEditor;
  }
}