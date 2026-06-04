import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error("Wayne Ops Hub render error", error);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="login-screen">
          <section className="login-panel">
            <div className="login-brand">
              <p>OPS HUB</p>
              <h1>Wayne Ops Hub</h1>
            </div>
            <p className="error-text">{this.state.error.message || "The app could not render."}</p>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
