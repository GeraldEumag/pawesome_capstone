@extends('emails.layout')

@section('title', $title)

@section('content')
    <h2>{{ $title }}</h2>
    <div class="body">{{ $body }}</div>
@endsection
