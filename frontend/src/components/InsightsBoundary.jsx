import { Component } from 'react'

/* eslint-disable react/prop-types */
export default class InsightsBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="insights-error" role="alert">
          <p>통계를 불러오지 못했어요. 연결을 확인한 뒤 페이지를 새로고침해주세요.</p>
          <button className="text-button" type="button" onClick={() => window.location.reload()}>페이지 새로고침</button>
        </div>
      )
    }
    return this.props.children
  }
}
