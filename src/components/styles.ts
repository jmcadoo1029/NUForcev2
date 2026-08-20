import type { CSSProperties } from 'react'

// Shared inline-style building blocks used across features, so a restyle happens
// in one place instead of drifting between copies.

/** Left-aligned item inside a dropdown menu (Spec Builder menus, etc.). */
export const menuItemStyle: CSSProperties = { fontFamily: 'inherit', display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '10px 14px', fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }
