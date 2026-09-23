'use client';

import { useEffect, useRef, useState } from 'react';
import { projects } from './portfolio-content';
import Image from 'next/image';

export type DesktopMode = 'computer' | 'television';

export default function ProjectDesktop({ mode, onClose }: { mode: DesktopMode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState(0);
  const project = projects[selected];

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const selectProject = (index: number) => {
    setSelected(index);
    dialog.current?.querySelector('.project-detail')?.scrollTo({ top: 0 });
  };

  return (
    <dialog ref={dialog} className={`project-desktop ${mode === 'television' ? 'television-desktop' : 'studio-desktop'}`} onCancel={(event) => { event.preventDefault(); onClose(); }} aria-label={mode === 'computer' ? 'Timi 的项目电脑' : 'Timi 的作品电视'}>
      <div className="desktop-menubar">
        <span className="desktop-monogram">T.</span>
        <strong>{mode === 'computer' ? 'Timi Studio' : 'Timi TV'}</strong>
        <span className="desktop-owner">陈楚涛 · AI 创作者</span>
        <button type="button" className="desktop-exit" onClick={onClose} autoFocus>返回房间 <span aria-hidden="true">↗</span></button>
      </div>
      <div className="desktop-workspace">
        <aside className="desktop-sidebar" aria-label="项目文件夹">
          {mode === 'computer' && <div className="desktop-library-heading"><span>PERSONAL WORKSPACE</span><h2>我的创作</h2><p>一些想法，一些正在发生的作品。</p></div>}
          <p className="desktop-section-label">作品目录 <span>{projects.length}</span></p>
          {projects.map((item, index) => (
            <button key={item.id} type="button" className={index === selected ? 'selected' : ''} onClick={() => selectProject(index)} aria-pressed={index === selected}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7V5a1 1 0 0 1 1-1h6l2 3h8a1 1 0 0 1 1 1v11H3Z" /></svg>
              <span className="desktop-project-label">{item.name}{mode === 'computer' && <small>{item.category}</small>}</span>
              {mode === 'computer' && <span className="desktop-selection-arrow" aria-hidden="true">↗</span>}
            </button>
          ))}
          <div className="desktop-about">{mode === 'computer' && <Image src="/wallpapers/portrait-user.jpg" alt="" width={40} height={40} className="desktop-avatar" unoptimized />}<strong>Timi</strong><p>一个使用 AI 进行创作的大学生。</p><span>让想法变成可以使用的作品。</span></div>
        </aside>
        <article className="project-window" key={project.id}>
          <div className="project-window-path"><span><span className="window-path-root">我的作品</span> / {project.name}</span><span>{String(selected + 1).padStart(2, '0')} / {String(projects.length).padStart(2, '0')}</span></div>
          <div className="project-detail">
            <div className="project-heading"><div><p>{project.category}</p><h1>{project.name}</h1></div><span className="project-status">{project.status}</span></div>
            <p className="project-summary">{project.summary}</p>
            {project.image && <figure className={`project-capture ${project.compactImage ? 'compact-capture' : ''}`}><Image src={project.image} alt={`${project.name}的项目界面`} width={project.compactImage ? 240 : 1440} height={project.compactImage ? 140 : 1000} unoptimized /><figcaption>{project.imageCaption ?? '项目界面'}</figcaption></figure>}
            <div className="project-notes"><h2>我做了什么</h2><ul>{project.features.map(feature => <li key={feature}>{feature}</li>)}</ul></div>
            <div className="project-tags">{project.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
            <p className="project-progress-note">{project.statusNote}</p>
            {project.url ? <a className="project-open" href={project.url} target="_blank" rel="noreferrer">打开项目 <span aria-hidden="true">↗</span></a> : <p className="project-local-note">本地作品 · 当前展示项目介绍与界面</p>}
          </div>
        </article>
      </div>
      <div className="desktop-taskbar"><span className="desktop-running-dot" />{project.name}<span className="desktop-taskbar-note">{mode === 'television' ? '作品频道' : '项目文件夹'} · {projects.length} 个作品</span>{mode === 'television' && <div className="tv-channel-controls"><button type="button" aria-label="上一个作品" onClick={() => selectProject((selected - 1 + projects.length) % projects.length)}>←</button><button type="button" aria-label="下一个作品" onClick={() => selectProject((selected + 1) % projects.length)}>→</button></div>}</div>
    </dialog>
  );
}
