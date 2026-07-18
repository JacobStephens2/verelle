# Product Definition

## Concept Brief

Verelle - Marquette Method Fertility Care

A cross-platform application for a couple to track their use of the Marquette Method for care of their fertility.

I want the user to be able to use their Verelle account on web, Android + Wear OS, and iOS + watchOS.

# Architecture & Decisions

## Architecture Overview / Software Design Document

Headless core with native shells to have shared business logic

## Database

PostgreSQL

# Cross-Platform-Specific

### Shared Core business logic

Rust

### Server

Rust + Axum

### Web

Leptos (or use TypeScript to have a larger ecosystem to pull from, though I want to try Leptos in an app and it may make using the Rust business logic easier in the web app than using wasm-bindgen to TypeScript/JavaScript)

### iOS + watchOS

Swift + SwiftUI + UniFFI to bind Rust business logic

### Android + Wear OS

Kotlin + Jetpack Compose + UniFFI to bind Rust business logic

## Domain

verelle.app

## Payments

Stripe to the Mercury Checking account of Stephens Page LLC 

Probably a freemium model where local use is free but server side features require a monthy or yearly subscription.


## Release / CI/CD Plan

GitOps, GitHub Actions, OpenTofu, Ansible, Digital Ocean VM (optionally on my stephens.page VM), Cloudflare DNS nameserver, Porkbun Registrar - overall having as much of the app encoded and its environment and configuration as possible

## Distribution

App Store, Play Store, website

## Style

Feminine, possibly blue ish to match the Clearblue Fertility Monitor, as seen at https://www.vitaefertility.com/wp-content/uploads/2021/08/clearblue-fertility-monitor-for-marquette-method-nfp.jpg, so inspired by that but still more feminine and a bit distinct from that