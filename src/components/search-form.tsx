type Props = {
  defaultValue?: string;
  placeholder?: string;
  id?: string;
};

/**
 * Central search box.
 *
 * It is a plain GET form, so the search works without JavaScript and the
 * results can be shared with a link.
 */
export function SearchForm({
  defaultValue = '',
  placeholder = '¿Qué estás buscando? Juegos, reseñas, noticias…',
  id = 'site-search',
}: Props) {
  return (
    <form className="site-search" action="/buscar" method="get" role="search">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m20 20-4.8-4.8" />
      </svg>
      <input
        id={id}
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label="Buscar en Netti"
        autoComplete="off"
      />
      <button type="submit">Buscar</button>
    </form>
  );
}
