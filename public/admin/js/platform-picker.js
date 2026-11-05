/*
    PlatformPicker — Selector de plataformas para el panel editorial. Renderiza chips con logo y nombre, permite seleccionar múltiples plataformas.
    Soporta valores arbitrarios (texto libre) además de los presets del catálogo.
*/
class PlatformPicker {
  constructor({ container, value = [], onChange, logos }) {
    this.container = container;
    this.value = new Set(value);
    this.onChange = onChange;
    this.logos = logos || {};
    this.customInput = null;
    this.render();
  }

  render() {
    this.container.innerHTML = "";
    this.container.className = "platform-picker";

    const presetKeys = Object.keys(this.logos);

    presetKeys.forEach((key) => {
      const logo = this.logos[key];
      const isSelected = this.value.has(logo.label);
      const chip = document.createElement("label");
      chip.className = `platform-chip ${isSelected ? "selected" : ""}`;
      chip.title = logo.label;
      chip.innerHTML = `
        <input type="checkbox" value="${logo.label}" ${isSelected ? "checked" : ""} />
        <img src="${logo.image}" alt="${logo.label}" width="20" height="20" />
        <span>${logo.label}</span>
      `;
      chip.querySelector("input").addEventListener("change", (e) => {
        if (e.target.checked) this.value.add(logo.label);
        else this.value.delete(logo.label);
        this.onChange([...this.value]);
        this.renderCustomInput();
      });
      this.container.appendChild(chip);
    });

    this.renderCustomInput();
  }

  renderCustomInput() {
    if (this.customInput) {
      this.customInput.remove();
      this.customInput = null;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "platform-custom";

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Otra plataforma…";
    input.className = "platform-custom-input";
    input.addEventListener("input", (e) => {
      const val = e.target.value.trim();
      if (!val) return;
      const customs = [...this.value].filter((v) => !this.isPreset(v));
      if (customs.length) this.value.delete(customs[0]);
      this.value.add(val);
      this.onChange([...this.value]);
    });

    const label = document.createElement("span");
    label.textContent = "Otra:";
    label.className = "platform-custom-label";

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    this.container.appendChild(wrapper);
    this.customInput = input;
  }

  isPreset(value) {
    return Object.values(this.logos).some((l) => l.label === value);
  }

  getValue() {
    return [...this.value];
  }
}

window.PlatformPicker = PlatformPicker;
