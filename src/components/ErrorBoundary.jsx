import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', backgroundColor: '#fee2e2', color: '#991b1b', fontFamily: 'sans-serif', height: '100vh' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>アプリケーションエラーが発生しました</h1>
          <p style={{ marginTop: '10px' }}>以下のエラーメッセージをコピーして、開発者（Antigravity）に報告してください：</p>
          <pre style={{ marginTop: '20px', padding: '10px', backgroundColor: '#fef2f2', border: '1px solid #f87171', overflowX: 'auto' }}>
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </pre>
          <button 
            style={{ marginTop: '20px', padding: '10px 20px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
            onClick={() => window.location.reload()}
          >
            ページを再読み込み
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
