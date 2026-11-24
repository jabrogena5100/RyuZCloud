package videos

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"unicode/utf8"
)

// Credit says who made the footage and under which licence, for videos whose owner did not
// shoot them (the demo library: Pixabay and Wikimedia Commons). It is the owner's statement;
// the API validates its shape, not its truth.
type Credit struct {
	Source        string  `json:"source"`
	SourcePageURL string  `json:"source_page_url"`
	Author        string  `json:"author"`
	AuthorURL     *string `json:"author_url"`
	LicenseName   string  `json:"license_name"`
	LicenseURL    *string `json:"license_url"`
}

const (
	maxCreditText = 200
	maxCreditURL  = 500
)

// parseCredit decodes and validates a "credit" field. Absent or JSON null gives (nil, nil).
func parseCredit(raw json.RawMessage) (*Credit, error) {
	if raw == nil || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return nil, nil
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	var c Credit
	if err := dec.Decode(&c); err != nil {
		return nil, errors.New("must be an object with source, source_page_url, author, author_url, license_name, license_url")
	}
	for name, value := range map[string]*string{"source": &c.Source, "author": &c.Author, "license_name": &c.LicenseName} {
		*value = strings.TrimSpace(*value)
		if *value == "" || utf8.RuneCountInString(*value) > maxCreditText {
			return nil, fmt.Errorf("%s must be 1 to %d characters", name, maxCreditText)
		}
	}
	if !webURL(c.SourcePageURL) {
		return nil, errors.New("source_page_url must be an http(s) URL")
	}
	for name, value := range map[string]*string{"author_url": c.AuthorURL, "license_url": c.LicenseURL} {
		if value != nil && *value != "" && !webURL(*value) {
			return nil, fmt.Errorf("%s must be an http(s) URL or null", name)
		}
	}
	// Empty optional URLs are stored as null.
	if c.AuthorURL != nil && *c.AuthorURL == "" {
		c.AuthorURL = nil
	}
	if c.LicenseURL != nil && *c.LicenseURL == "" {
		c.LicenseURL = nil
	}
	return &c, nil
}

func webURL(s string) bool {
	if s == "" || len(s) > maxCreditURL {
		return false
	}
	u, err := url.Parse(s)
	return err == nil && (u.Scheme == "https" || u.Scheme == "http") && u.Host != ""
}
