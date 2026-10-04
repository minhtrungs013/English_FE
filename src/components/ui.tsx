import type { CSSProperties, ReactNode } from 'react';
import { IC, type IconName } from '../lib/icons';
import { ST_LABEL, type Level, type Status } from '../lib/data';
import { useWB } from '../state/WordbookContext';

type Size = 'sm' | 'lg' | 'xl';

export function Icon({ name, size, style, className }: { name: IconName; size?: Size; style?: CSSProperties; className?: string }) {
  const cls = ['ic', size ? 'ic-' + size : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <svg className={cls} viewBox="0 0 24 24" style={style} aria-hidden="true">
      <path d={IC[name]} />
    </svg>
  );
}

export const LevelBadge = ({ level }: { level: Level }) => <span className={'badge lv-' + level}>{level}</span>;
export const StatusBadge = ({ status }: { status: Status }) => <span className={'badge st st-' + status}>{ST_LABEL[status]}</span>;
export const PosBadge = ({ children }: { children: ReactNode }) => <span className="badge pos">{children}</span>;

export interface MenuItem { value: string; label: string; icon?: IconName }

/** A button that opens a dropdown menu. Only one menu is open at a time (tracked in app state). */
export function Dropdown(props: {
  id: string; label: string; icon: IconName; items: MenuItem[]; value: string;
  onPick: (v: string) => void; active?: boolean; full?: boolean; footer?: ReactNode;
}) {
  const { s, a } = useWB();
  const open = s.menu === props.id;
  return (
    <div className="mwrap">
      <button className={'mbtn' + (props.full ? ' full' : '') + (props.active ? ' on' : '')} onClick={() => a.setMenu(open ? null : props.id)} aria-expanded={open}>
        <Icon name={props.icon} size="sm" />
        <span className="grow">{props.label}</span>
        <Icon name="down" size="sm" />
      </button>
      {open && (
        <div className={'menu' + (props.full ? ' full' : '')}>
          {props.items.map((it) => (
            <button key={it.value} className={'mitem' + (it.value === props.value ? ' on' : '')} onClick={() => { props.onPick(it.value); a.setMenu(null); }}>
              {it.icon && <Icon name={it.icon} size="sm" />}
              {it.label}
            </button>
          ))}
          {props.footer}
        </div>
      )}
    </div>
  );
}

export function EmptyState({ icon, tint = 't-indigo', title, text, children, card = true }: {
  icon?: IconName; tint?: string; title: string; text: string; children?: ReactNode; card?: boolean;
}) {
  return (
    <div className={card ? 'card empty' : 'empty'}>
      {icon && <div className={'empty-ic ' + tint}><Icon name={icon} size="xl" /></div>}
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="ph">
      <div>
        <h1 className="h1">{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}
